/**
 * Background runs of the long reads, live (plan D24, Step 8): a long read
 * through the server's own dispatch — the binary's registration
 * (`registryOf(toolSet, 'stdio')`) on an in-process server holding the
 * launchers' background-run store — on both systems:
 *
 * - called without `background`, it answers a `run_handle` at once; its
 *   finished answer is read once, and a second read answers "not
 *   available";
 * - with `background: false` it answers its result in the call, on an ABAP
 *   session of its own, logged off after the answer;
 * - discarded while it runs, it is cancelled: its own session is logged off,
 *   the run is listed and read `cancelled` once, and the answer that comes
 *   late changes nothing;
 * - the read-only sets (`core-ro`, `compact-ro`) list the three run tools
 *   and run the first case.
 *
 * **Where the calls go.** The suite is a `liveSuite`; each of its three
 * sets is served by an in-process server of its own, the suite's runner for
 * the set's cases (`useLiveRunner`), on a guarded connection opened as
 * `liveSuite`'s runner opens one. The suite's own runner is not used: its
 * connection, tracked, is logged off when the file ends. The server is
 * reached over an in-memory MCP transport by plain JSON-RPC requests
 * (`InMemoryMcpClient`): no SDK client, so no request timer.
 *
 * **What makes the cancel deterministic.** The read is the shared table's
 * rows (`GetSqlQuery`, `HandlerGetData`): one request. The run's own
 * connection is the test's (the fresh-connection factory registered for the
 * injected connection) and holds that request's answer — SAP answered it —
 * until the test lets it through, after the discard: the run is running for
 * the server, whatever SAP's speed, and no timer decides anything. What
 * the hold does not show is SAP ending a read still under way: the read
 * has ended at SAP when the logoff arrives.
 *
 * **What is asserted of the logoff.** The connection answers no logoff
 * outcome of its own (`disconnect()` resolves once the logoff is written,
 * `flushGoodbye()` once SAP answered it or its transport failed, never
 * rejecting): the case asserts the run's connection was logged off exactly
 * once by the server, its goodbye settled, and it is no longer connected;
 * and, from the store, that the run ended `cancelled` with one `finish`.
 *
 * Read-only: nothing is created, changed or deleted. Every wait is on a
 * promise the code under test settles; no timer, no polling.
 */

import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  ListToolsResultSchema,
  type RequestId,
  type Result,
} from '@modelcontextprotocol/sdk/types.js';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { readOnlyToolSet as compactReadOnlyToolSet } from '../../../../compact-ro/src/launcher';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunStart,
  IBackgroundRuns,
} from '../../../lib/backgroundRuns/contract';
import { BACKGROUND_READ_CANCELLED_WORDS } from '../../../lib/backgroundRuns/run';
import { systemKindOf } from '../../../lib/connectionFactory';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { registerFreshConnectionFactory } from '../../../lib/packageSessions';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { declareSystemKind } from '../../../lib/systemKind';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ToolSet,
} from '../../../lib/toolSet';
import type { SystemKind } from '../../helpers/servedTools';
import { toolAnswer } from '../../helpers/toolAnswer';
import { getTestDestination } from '../helpers/authHelpers';
import {
  configuredSystemKind,
  getSharedDependenciesConfig,
} from '../helpers/configHelpers';
import {
  type LiveAnswer,
  type LiveRunner,
  liveCall,
  livePrepare,
  liveSuite,
  useLiveRunner,
} from '../helpers/live';
import { endTestConnection, trackConnection } from '../helpers/openConnections';
import { primeSystemContext } from '../helpers/primeSystemContext';
import {
  type GuardedConnection,
  guardedTestConnection,
} from '../helpers/refusalGuard';

// ---------------------------------------------------------------------------
// Waits on what the code under test settles

/** A promise and its resolve, settled by the code under test. */
interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// The store: the launchers' in-memory store, its `finish` observed

/**
 * `InMemoryBackgroundRuns`, as every launcher hands it to the server, with
 * each run's `finish` counted and awaitable: a run's end is waited for on
 * the store, never polled.
 */
class ObservedRuns implements IBackgroundRuns {
  private readonly kept = new InMemoryBackgroundRuns();
  private readonly ends = new Map<string, Deferred>();
  private readonly finishes = new Map<string, number>();

  private endOf(handle: string): Deferred {
    const known = this.ends.get(handle);
    if (known !== undefined) return known;
    const made = deferred();
    this.ends.set(handle, made);
    return made;
  }

  /** Settles once the run `handle`'s answer was kept. */
  ended(handle: string): Promise<void> {
    return this.endOf(handle).promise;
  }

  /** How many times the run `handle`'s answer was handed to the store. */
  finishCount(handle: string): number {
    return this.finishes.get(handle) ?? 0;
  }

  start(caller: BackgroundRunCaller, run: BackgroundRunStart) {
    return this.kept.start(caller, run);
  }

  async finish(
    handle: string,
    answer: BackgroundRunAnswer,
    finishedAt: string,
  ): Promise<void> {
    await this.kept.finish(handle, answer, finishedAt);
    this.finishes.set(handle, this.finishCount(handle) + 1);
    this.endOf(handle).resolve();
  }

  get(handle: string, caller: BackgroundRunCaller) {
    return this.kept.get(handle, caller);
  }

  list(caller: BackgroundRunCaller) {
    return this.kept.list(caller);
  }

  discard(handle: string, caller: BackgroundRunCaller) {
    return this.kept.discard(handle, caller);
  }
}

// ---------------------------------------------------------------------------
// The server's own connections: each fresh connection observed

/** A fresh connection the server opened (a run's own, a call's own). */
interface OwnConnection {
  readonly connection: GuardedConnection;
  /** Settles at its first request. */
  readonly entered: Promise<void>;
  /** How many times the server asked its logoff. */
  logoffs(): number;
}

/**
 * `inner`, delegated member by member (as `refusalGuardedConnection` does),
 * its logoffs counted; with `hold`, every answer SAP gave waits for it
 * before it reaches the server.
 */
function observed(
  inner: GuardedConnection,
  hold: Promise<void> | undefined,
): OwnConnection {
  const first = deferred();
  let logoffs = 0;
  const connection: GuardedConnection = {
    connect: () => inner.connect(),
    makeAdtRequest: async <T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ) => {
      first.resolve();
      const answered = await inner.makeAdtRequest<T, D>(options);
      if (hold !== undefined) await hold;
      return answered;
    },
    disconnect: () => {
      logoffs += 1;
      return inner.disconnect();
    },
    flushGoodbye: (timeoutMs) => inner.flushGoodbye(timeoutMs),
    getBaseUrl: () => inner.getBaseUrl(),
    getSessionId: () => inner.getSessionId(),
    setSessionType: (type) => inner.setSessionType(type),
    getSessionMode: () => inner.getSessionMode(),
    isConnected: () => inner.isConnected(),
    getConfig: () => inner.getConfig(),
    sessionCookies: () => inner.sessionCookies(),
    getSessionIdentity: () => inner.getSessionIdentity(),
    beginCriticalSection: () => inner.beginCriticalSection(),
    endCriticalSection: () => inner.endCriticalSection(),
  };
  declareSystemKind(connection, systemKindOf(inner));
  return { connection, entered: first.promise, logoffs: () => logoffs };
}

// ---------------------------------------------------------------------------
// The in-process server of one tool set, and its client

class LiveRunServer extends BaseMcpServer {
  use(connection: IAbapConnection, destination: string): void {
    this.setConnectionContext({
      kind: 'injected',
      connection,
      // An RFC connection answers no URL: the host states the system a run
      // is kept for, here the destination, which names one system.
      system: destination,
      sessionId: 'live-background-runs',
      destination,
    });
  }
  register(toolSet: ToolSet): void {
    this.registerHandlers(registryOf(toolSet, 'stdio'));
  }
}

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/**
 * The client end of an in-memory MCP transport, by plain JSON-RPC
 * requests: each request answered by the response of its id, with no timer
 * of its own; the server's notifications are not read.
 */
class InMemoryMcpClient {
  private nextId = 0;
  private readonly waiting = new Map<
    RequestId,
    { resolve(result: Result): void; reject(error: Error): void }
  >();

  constructor(private readonly transport: InMemoryTransport) {
    transport.onmessage = (message) => this.received(message);
  }

  private received(message: JSONRPCMessage): void {
    if (isJSONRPCResultResponse(message)) {
      this.waiting.get(message.id)?.resolve(message.result);
      this.waiting.delete(message.id);
    } else if (isJSONRPCErrorResponse(message)) {
      const id = message.id;
      if (id === undefined) return;
      this.waiting
        .get(id)
        ?.reject(
          new Error(
            `MCP error ${message.error.code}: ${message.error.message}`,
          ),
        );
      this.waiting.delete(id);
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Result> {
    this.nextId += 1;
    const id = this.nextId;
    const answered = new Promise<Result>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
    });
    return this.transport
      .send({ jsonrpc: '2.0', id, method, params })
      .then(() => answered);
  }

  /** The MCP handshake: `initialize`, then `notifications/initialized`. */
  async connect(): Promise<void> {
    await this.transport.start();
    await this.request('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'live', version: '1.0.0' },
    });
    await this.transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }

  async callTool(tool: string, args: ToolArgs): Promise<LiveAnswer> {
    const result = toolAnswer(
      CallToolResultSchema.parse(
        await this.request('tools/call', {
          name: tool,
          arguments: { ...args },
        }),
      ),
    );
    const content = result.content.map((item) => ({
      type: 'text' as const,
      text: item.text,
    }));
    return {
      isError: result.isError === true,
      content,
      text: content.map((item) => item.text).join('\n'),
    };
  }

  async listTools(): Promise<string[]> {
    const listed = ListToolsResultSchema.parse(
      await this.request('tools/list', {}),
    );
    return listed.tools.map((tool) => tool.name);
  }

  close(): Promise<void> {
    for (const pending of this.waiting.values()) {
      pending.reject(new Error('the client closed'));
    }
    this.waiting.clear();
    return this.transport.close();
  }
}

/** What a set's server holds beside its runner. */
interface Served {
  readonly runs: ObservedRuns;
  /** Every fresh connection the server opened, in order. */
  readonly own: OwnConnection[];
  /** Holds every answer of the next fresh connection until `release`. */
  holdNext(): { release(): void };
  /** The names of the tools the server lists. */
  tools(): Promise<string[]>;
}

let served: Served | undefined;

function current(): Served {
  if (served === undefined) throw new Error('no server: inside a set only');
  return served;
}

/**
 * The runner of a set: the configured destination's guarded connection
 * (as `liveSuite`'s runner opens it), injected into an in-process server
 * serving `toolSet` with the background-run store; every call goes through
 * the server's dispatch. The connection's fresh connections are the test's
 * guarded siblings, observed.
 */
async function serverRunner(
  system: SystemKind,
  toolSet: ToolSet,
): Promise<LiveRunner> {
  const destination = await getTestDestination();
  if (destination === null) {
    throw new Error('the test config names no destination');
  }
  const open = () =>
    guardedTestConnection(destination.settings, destination.credential, {
      kind: system,
    });
  const connection = trackConnection(open());
  await connection.connect();
  await primeSystemContext(connection);

  const own: OwnConnection[] = [];
  let hold: Promise<void> | undefined;
  registerFreshConnectionFactory(connection, async () => {
    const fresh = observed(open(), hold);
    hold = undefined;
    own.push(fresh);
    return fresh.connection;
  });

  const runs = new ObservedRuns();
  const server = new LiveRunServer({
    name: 'live-background-runs',
    logger: silent,
    systemType: system,
    systemContextResolver: defaultSystemContextResolver,
    backgroundRuns: runs,
  });
  server.use(connection, destination.destination);
  server.register(toolSet);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new InMemoryMcpClient(clientSide);
  await server.connect(serverSide);
  await client.connect();

  served = {
    runs,
    own,
    holdNext: () => {
      const gate = deferred();
      hold = gate.promise;
      return { release: gate.resolve };
    },
    tools: () => client.listTools(),
  };
  return {
    system,
    user: destination.settings.username ?? '',
    connection: () => connection,
    call: (tool, args) => client.callTool(tool, args),
    close: async () => {
      served = undefined;
      await client.close();
      await server.terminalClose();
      // A fresh connection the server did not log off (none, when every
      // case ran to its end) is logged off here.
      for (const fresh of own) {
        if (fresh.logoffs() === 0) await endTestConnection(fresh.connection);
      }
    },
  };
}

/** The configured system, inside a `liveSuite` that runs on it. */
function configuredSystem(): SystemKind {
  const kind = configuredSystemKind();
  if (kind !== 'onprem' && kind !== 'cloud') {
    throw new Error(`no system this suite runs on is configured: ${kind}`);
  }
  return kind;
}

/**
 * The cases of the enclosing describe go to a server serving `toolSet`: its
 * runner is the suite's from before them until after them, when it is
 * closed and its connection logged off.
 */
function servedBy(toolSet: ToolSet): void {
  let runner: LiveRunner | undefined;
  beforeAll(async () => {
    runner = await serverRunner(configuredSystem(), toolSet);
    useLiveRunner(runner);
  });
  afterAll(async () => {
    useLiveRunner(undefined);
    const ending = runner;
    runner = undefined;
    if (ending === undefined) return;
    await ending.close();
    await endTestConnection(ending.connection());
  });
}

// ---------------------------------------------------------------------------
// The read and its answers

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The shared table the configured system holds: what the read reads. */
function sharedTable(): string {
  const kind = configuredSystemKind();
  const tables: unknown = getSharedDependenciesConfig()?.tables;
  const found = Array.isArray(tables)
    ? tables.find((table) => {
        const availableIn = member(table, 'available_in');
        return (
          typeof member(table, 'name') === 'string' &&
          (!Array.isArray(availableIn) || availableIn.includes(kind))
        );
      })
    : undefined;
  const name = member(found, 'name');
  if (typeof name !== 'string') {
    throw new Error('the test config names no shared table for this system');
  }
  return name;
}

/** The query every case reads: the rows of the shared table. */
function query(): string {
  return `SELECT * FROM ${sharedTable()}`;
}

/** The JSON of an answer's `at`-th content item. */
function itemOf(answer: LiveAnswer, at: number): unknown {
  const item = answer.content[at];
  if (item === undefined) {
    throw new Error(`the answer has no item ${at}: ${answer.text}`);
  }
  return JSON.parse(item.text);
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** The run a start answered: its handle, the answer `running`. */
function startedHandle(tool: string, answer: LiveAnswer): string {
  const started = itemOf(succeeded(tool, answer), 0);
  expect(member(started, 'state')).toBe('running');
  expect(member(started, 'tool')).toBe(tool);
  const handle = member(started, 'run_handle');
  if (typeof handle !== 'string' || handle === '') {
    throw new Error(`${tool} answered no run_handle: ${answer.text}`);
  }
  return handle;
}

/** A run read `finished`: its header, then the rows of the shared table. */
function expectFinished(answer: LiveAnswer, handle: string, tool: string) {
  const header = itemOf(succeeded(`the run of ${tool}`, answer), 0);
  expect(member(header, 'state')).toBe('finished');
  expect(member(header, 'run_handle')).toBe(handle);
  expect(member(header, 'tool')).toBe(tool);
  expectRows(itemOf(answer, 1));
}

/** The rows of the shared table, as the read answers them. */
function expectRows(payload: unknown): void {
  expect(member(payload, 'sql_query')).toBe(query());
  expect(Array.isArray(member(payload, 'columns'))).toBe(true);
  expect(Array.isArray(member(payload, 'rows'))).toBe(true);
}

/** A read of a run that is gone: "not available". */
function expectNotAvailable(answer: LiveAnswer): void {
  expect(answer.isError).toBe(true);
  expect(member(itemOf(answer, 0), 'error')).toBe(
    'background_run_not_available',
  );
}

/** The tools a set lists, among them `names`. */
async function expectListed(names: readonly string[]): Promise<void> {
  expect(await current().tools()).toEqual(expect.arrayContaining([...names]));
}

// ---------------------------------------------------------------------------
// The cases

liveSuite(['onprem', 'cloud'], 'Background runs of a long read', () => {
  describe('core', () => {
    servedBy(fullToolSet);

    it('a long read called without background answers a run_handle, read finished once', async () => {
      const started = await liveCall('GetSqlQuery', {
        sql_query: query(),
        row_number: 5,
      });
      const handle = startedHandle('GetSqlQuery', started);
      await current().runs.ended(handle);

      const finished = await liveCall('GetBackgroundRun', {
        run_handle: handle,
      });
      expectFinished(finished, handle, 'GetSqlQuery');
      expectNotAvailable(
        await livePrepare('GetBackgroundRun', { run_handle: handle }),
      );
      expect(current().runs.finishCount(handle)).toBe(1);
    });

    it('a long read with background false answers its result in the call, on a session of its own', async () => {
      const before = current().own.length;
      const answered = await liveCall('GetSqlQuery', {
        sql_query: query(),
        row_number: 5,
        background: false,
      });
      const payload = itemOf(succeeded('GetSqlQuery', answered), 0);
      expect(member(payload, 'run_handle')).toBeUndefined();
      expectRows(payload);
      // One connection of its own, logged off after the answer.
      const opened = current().own.slice(before);
      expect(opened).toHaveLength(1);
      expect(opened[0]?.logoffs()).toBe(1);
    });

    it('a background read discarded while it runs is cancelled, its session logged off', async () => {
      const held = current().holdNext();
      const handle = startedHandle(
        'GetSqlQuery',
        await livePrepare('GetSqlQuery', { sql_query: query(), row_number: 5 }),
      );
      const own = current().own.at(-1);
      if (own === undefined) throw new Error('the run opened no connection');
      // Its request was sent; its answer is held, so the run is running.
      await own.entered;
      expect(own.logoffs()).toBe(0);

      const discarded = await liveCall('DiscardBackgroundRun', {
        run_handle: handle,
      });
      expect(itemOf(succeeded('DiscardBackgroundRun', discarded), 0)).toEqual({
        run_handle: handle,
        state: 'cancelled',
      });
      // The run's own session: logged off once, by the server, its goodbye
      // settled; the connection is no longer connected.
      expect(own.logoffs()).toBe(1);
      await own.connection.flushGoodbye();
      expect(own.connection.isConnected()).toBe(false);

      const listed = await liveCall('ListBackgroundRuns', {});
      const runs = member(
        itemOf(succeeded('ListBackgroundRuns', listed), 0),
        'runs',
      );
      expect(
        Array.isArray(runs)
          ? runs
              .filter((run) => member(run, 'run_handle') === handle)
              .map((run) => member(run, 'state'))
          : runs,
      ).toEqual(['cancelled']);

      // The answer SAP gave reaches the run now, after the cancel.
      held.release();

      const cancelled = await liveCall('GetBackgroundRun', {
        run_handle: handle,
      });
      expect(member(itemOf(cancelled, 0), 'state')).toBe('cancelled');
      expect(cancelled.content[1]?.text).toBe(BACKGROUND_READ_CANCELLED_WORDS);
      expectNotAvailable(
        await livePrepare('GetBackgroundRun', { run_handle: handle }),
      );
      // One end kept, the cancel's; the late answer kept nothing, and
      // nothing more was sent on the run's session.
      expect(current().runs.finishCount(handle)).toBe(1);
      expect(own.logoffs()).toBe(1);
    });
  });

  describe('core-ro', () => {
    servedBy(fullReadOnlyToolSet);

    it('the read-only set lists the three run tools', async () => {
      await expectListed([
        'GetBackgroundRun',
        'ListBackgroundRuns',
        'DiscardBackgroundRun',
      ]);
    });

    it('a long read called without background answers a run_handle, read finished once', async () => {
      const started = await liveCall('GetSqlQuery', {
        sql_query: query(),
        row_number: 5,
      });
      const handle = startedHandle('GetSqlQuery', started);
      await current().runs.ended(handle);

      const finished = await liveCall('GetBackgroundRun', {
        run_handle: handle,
      });
      expectFinished(finished, handle, 'GetSqlQuery');
      expectNotAvailable(
        await livePrepare('GetBackgroundRun', { run_handle: handle }),
      );
      expect(current().runs.finishCount(handle)).toBe(1);
    });
  });

  describe('compact-ro', () => {
    servedBy(compactReadOnlyToolSet);

    it('the read-only compact set lists the three run tools', async () => {
      await expectListed([
        'HandlerBackgroundRunGet',
        'HandlerBackgroundRunList',
        'HandlerBackgroundRunDiscard',
      ]);
    });

    it('a long read called without background answers a run_handle, read finished once', async () => {
      const started = await liveCall('HandlerGetData', {
        sql_query: query(),
        max_rows: 5,
      });
      const handle = startedHandle('HandlerGetData', started);
      await current().runs.ended(handle);

      const finished = await liveCall('HandlerBackgroundRunGet', {
        run_handle: handle,
      });
      expectFinished(finished, handle, 'HandlerGetData');
      expectNotAvailable(
        await livePrepare('HandlerBackgroundRunGet', { run_handle: handle }),
      );
      expect(current().runs.finishCount(handle)).toBe(1);
    });
  });
});
