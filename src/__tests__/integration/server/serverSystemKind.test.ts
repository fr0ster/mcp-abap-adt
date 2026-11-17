/**
 * An `EmbeddableMcpServer`'s `systemType` reaches every connection it hands a
 * tool, live (D26 B1, B2): with `SAP_SYSTEM_TYPE` absent from the process
 * environment, the kind the option states is the kind of
 *
 * - the tool set it lists (an on-premise-only tool listed on `onprem`, not on
 *   `cloud`);
 * - the injected connection a read runs on (`GetAdtTypes`, through the ADT
 *   client of that kind);
 * - the fresh connection a long read runs on, in the call
 *   (`background: false`) and in the background (a `run_handle`, read
 *   `finished` by `GetBackgroundRun`) — each opened by the host's
 *   `freshConnection` factory.
 *
 * The control: the same injected connection on a server stating no
 * `systemType` is refused `system_type_required` before anything is sent —
 * so what made the reads run is the option, not the environment.
 *
 * **The injected connection states no kind of its own.** The configured
 * destination's guarded connection (`guardedTestConnection`, built for the
 * configured kind, which decides its wire) is wrapped member by member in an
 * object nothing declared a kind for, as an embedder's own connection class
 * is: the factory never built it, so only the server's option can give it a
 * kind. The fresh connections are wrapped the same way.
 *
 * **Where it runs.** Under `npm run test:integration` with this file named,
 * on either system: the configured destination (the test config's
 * `environment`), its kind from `environment.system_type` or the session
 * file, read before `SAP_SYSTEM_TYPE` is removed from the environment for
 * the file and put back after it. The realm check is the live run's setup.
 *
 * Read-only: nothing is created, changed or deleted. Every wait is on a
 * promise the code under test settles; no timer, no polling.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { McpResult } from '../../../lib/answer';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunStart,
  IBackgroundRuns,
} from '../../../lib/backgroundRuns/contract';
import { systemKindOf } from '../../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../../lib/credentialSources';
import type { SapEnvironment } from '../../../lib/handlers/interfaces';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { type AbapSystemKind, statedSystemKind } from '../../../lib/systemKind';
import { getTestDestination } from '../helpers/authHelpers';
import {
  getSapConfigFromEnv,
  getSystemType,
  loadTestConfig,
  loadTestEnv,
} from '../helpers/configHelpers';
import { endTestConnection, trackConnection } from '../helpers/openConnections';
import {
  type GuardedConnection,
  guardedTestConnection,
} from '../helpers/refusalGuard';
import { McpSession } from '../helpers/testers/hardMode';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** The object the long reads search: present on every ABAP system. */
const SEARCHED = 'CL_ABAP_TYPEDESCR';

/** A tool only the on-premise table serves. */
const ONPREM_ONLY_TOOL = 'CreateProgram';

// ---------------------------------------------------------------------------
// Waits on what the code under test settles

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

/**
 * The launchers' in-memory store, each run's end awaitable: a run is
 * waited for on the store, never polled.
 */
class ObservedRuns implements IBackgroundRuns {
  private readonly kept = new InMemoryBackgroundRuns();
  private readonly ends = new Map<string, Deferred>();

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

  start(caller: BackgroundRunCaller, run: BackgroundRunStart) {
    return this.kept.start(caller, run);
  }

  async finish(
    handle: string,
    answer: BackgroundRunAnswer,
    finishedAt: string,
  ): Promise<void> {
    await this.kept.finish(handle, answer, finishedAt);
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
// Connections that state no kind of their own

/** A connection the test hands the server, its logoffs counted. */
interface Undeclared {
  readonly connection: GuardedConnection;
  logoffs(): number;
}

/**
 * `inner`, delegated member by member (as `refusalGuardedConnection` does),
 * with no kind declared for the wrapper: the factory did not build it, so
 * `systemKindOf` answers only what a server declares for it.
 */
function undeclared(inner: GuardedConnection): Undeclared {
  let logoffs = 0;
  const connection: GuardedConnection = {
    connect: () => inner.connect(),
    makeAdtRequest: <T = unknown, D = unknown>(options: IAbapRequestOptions) =>
      inner.makeAdtRequest<T, D>(options),
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
  return { connection, logoffs: () => logoffs };
}

// ---------------------------------------------------------------------------
// The configured destination

/** What a connection to the configured destination is built from. */
interface Source {
  settings: SapConfig;
  credential: Parameters<typeof guardedTestConnection>[1];
}

/**
 * The configured destination's settings and credential, as
 * `createTestConnectionAndSession` takes them: the factory's when the config
 * names a destination of the stores, else the loaded environment's.
 */
async function destinationSource(): Promise<Source> {
  await loadTestEnv();
  const explicitEnv = !!loadTestConfig()?.environment?.env;
  const target = explicitEnv ? null : await getTestDestination();
  if (target !== null) {
    return { settings: target.settings, credential: target.credential };
  }
  const settings = getSapConfigFromEnv();
  return { settings, credential: credentialFromSapConfig(settings) };
}

// ---------------------------------------------------------------------------
// The server and its client

/** One server over an in-memory transport, and what it opened. */
interface Served {
  readonly session: McpSession;
  readonly runs: ObservedRuns;
  /** The connection injected into it. */
  readonly injected: Undeclared;
  /** Every fresh connection its factory gave, in order. */
  readonly fresh: Undeclared[];
  close(): Promise<void>;
}

/**
 * An `EmbeddableMcpServer` stating `systemType` (none when undefined), on a
 * connection of `main`'s that states no kind; its fresh connections are new
 * guarded connections of the destination, wrapped the same way. Stating a
 * kind, it takes the shipped system-context resolver, as a host does: on
 * the cloud a background run needs the session user, which only the
 * system names. The control states neither, so it asks the system nothing.
 */
async function serve(
  main: GuardedConnection,
  source: Source,
  wire: AbapSystemKind,
  systemType: SapEnvironment | undefined,
): Promise<Served> {
  const injected = undeclared(main);
  const fresh: Undeclared[] = [];
  const runs = new ObservedRuns();
  const server = new EmbeddableMcpServer({
    connection: injected.connection,
    exposition: ['readonly', 'high', 'system', 'search'],
    logger: silent,
    backgroundRuns: runs,
    freshConnection: async () => {
      const opened = undeclared(
        guardedTestConnection(source.settings, source.credential, {
          kind: wire,
        }),
      );
      fresh.push(opened);
      return opened.connection;
    },
    // Stating a kind, the server asks the system for the session user a
    // background run is kept for (a cloud session names none of its own).
    ...(systemType !== undefined && {
      systemType,
      systemContextResolver: defaultSystemContextResolver,
    }),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const session = new McpSession(clientSide);
  await session.initialize();
  return {
    session,
    runs,
    injected,
    fresh,
    close: async () => {
      await session.close();
      await server.terminalClose();
      // A fresh connection the server did not log off (none, when every
      // case ran to its end) is logged off here.
      for (const opened of fresh) {
        if (opened.logoffs() === 0) await endTestConnection(opened.connection);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Answers

function textOf(answer: McpResult): string {
  return answer.content.map((item) => item.text).join('\n');
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: McpResult): McpResult {
  if (answer.isError) throw new Error(`${step}: ${textOf(answer)}`);
  return answer;
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The JSON of an answer's first content item. */
function firstItem(answer: McpResult): unknown {
  const item = answer.content[0];
  if (item === undefined) {
    throw new Error(`the answer has no content: ${textOf(answer)}`);
  }
  return JSON.parse(item.text);
}

// ---------------------------------------------------------------------------
// The cases

describe('EmbeddableMcpServer systemType, SAP_SYSTEM_TYPE absent (live)', () => {
  let stated: SapEnvironment;
  let wire: AbapSystemKind;
  let source: Source;
  let main: GuardedConnection | undefined;
  let served: Served | undefined;
  let savedType: string | undefined;

  before(async () => {
    source = await destinationSource();
    // Read before the environment loses it: the configured kind.
    stated = getSystemType();
    const kind = statedSystemKind(stated);
    if (kind === undefined) throw new Error(`no system kind: ${stated}`);
    wire = kind;
    main = trackConnection(
      guardedTestConnection(source.settings, source.credential, {
        kind: wire,
      }),
    );
    await main.connect();
    savedType = process.env.SAP_SYSTEM_TYPE;
    delete process.env.SAP_SYSTEM_TYPE;
    served = await serve(main, source, wire, stated);
  });

  after(async () => {
    try {
      await served?.close();
      if (main !== undefined) await endTestConnection(main);
    } finally {
      if (savedType !== undefined) process.env.SAP_SYSTEM_TYPE = savedType;
    }
  });

  function current(): Served {
    if (served === undefined) throw new Error('no server');
    return served;
  }

  it('the environment states no kind', () => {
    assert.equal(process.env.SAP_SYSTEM_TYPE, undefined);
  });

  it("lists the stated kind's tool set", async () => {
    const listed = new Set(
      (await current().session.listTools()).map((tool) => tool.name),
    );
    for (const name of ['GetAdtTypes', 'SearchObject', 'GetBackgroundRun']) {
      assert.equal(listed.has(name), true, `${name} is listed`);
    }
    assert.equal(listed.has(ONPREM_ONLY_TOOL), wire === 'onprem');
  });

  it('a read runs on the injected connection, of the stated kind', async () => {
    const answer = succeeded(
      'GetAdtTypes',
      await current().session.callTool('GetAdtTypes', {}),
    );
    assert.ok(answer.content.length > 0);
    assert.equal(systemKindOf(current().injected.connection), wire);
  });

  it('a long read in the call runs on a fresh connection of the stated kind', async () => {
    const before = current().fresh.length;
    succeeded(
      'SearchObject',
      await current().session.callTool('SearchObject', {
        object_name: SEARCHED,
        maxResults: 1,
        background: false,
      }),
    );
    const opened = current().fresh.slice(before);
    assert.equal(opened.length, 1);
    for (const each of opened) {
      assert.equal(systemKindOf(each.connection), wire);
      assert.equal(each.logoffs(), 1);
    }
  });

  it('a long read in the background runs on a fresh connection of the stated kind', async () => {
    const before = current().fresh.length;
    const started = firstItem(
      succeeded(
        'SearchObject',
        await current().session.callTool('SearchObject', {
          object_name: SEARCHED,
          maxResults: 1,
        }),
      ),
    );
    assert.equal(member(started, 'state'), 'running');
    const handle = member(started, 'run_handle');
    if (typeof handle !== 'string' || handle === '') {
      throw new Error('SearchObject answered no run_handle');
    }
    await current().runs.ended(handle);
    const finished = firstItem(
      succeeded(
        'GetBackgroundRun',
        await current().session.callTool('GetBackgroundRun', {
          run_handle: handle,
        }),
      ),
    );
    assert.equal(member(finished, 'state'), 'finished');
    assert.equal(member(finished, 'tool'), 'SearchObject');
    const opened = current().fresh.slice(before);
    assert.equal(opened.length, 1);
    for (const each of opened) {
      assert.equal(systemKindOf(each.connection), wire);
    }
  });

  it('the control: no systemType, the same connection is refused system_type_required', async () => {
    const connection = main;
    if (connection === undefined) throw new Error('no connection');
    const control = await serve(connection, source, wire, undefined);
    try {
      const answer = await control.session.callTool('GetAdtTypes', {});
      assert.equal(answer.isError, true);
      assert.ok(textOf(answer).includes('system_type_required'));
      assert.equal(systemKindOf(control.injected.connection), undefined);
      assert.equal(control.fresh.length, 0);
    } finally {
      await control.close();
    }
  });
});
