/**
 * A started tool runs to its end: a tool call cannot be cancelled. A
 * client's MCP cancel sent while the tool's first request is on the wire
 * aborts nothing — the handler runs once, every request of the tool is sent,
 * and its answer is produced (nobody reads it).
 *
 * - `UpdateServiceDefinition` with `activate: true`, the real adt-clients on
 *   the ADT stand-in, cancelled after its `LOCK` answered: the stand-in's log
 *   holds the `LOCK`, the update, the `UNLOCK` and the activation.
 * - No request of a started tool carries a signal, on any connection it
 *   runs on: stdio's kept connection (two concurrent calls on it), an
 *   injected connection (the tool handed that object, its `makeAdtRequest`
 *   the consumer's own function — identity checked — which every request
 *   reaches), and a host factory's fresh
 *   connection (the factory itself called with no argument).
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioServer } from '../../../../server/src/StdioServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { activeTools } from '../../../lib/activeTools';
import { CompactHandlersGroup } from '../../../lib/compact/group';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  PROBE_PATH,
  probeGroup,
} from '../../helpers/adtStandIn';
import { recordingConnection } from '../../helpers/recordingConnection';
import {
  isActivation,
  isLock,
  isUnlock,
  oneToolGroup,
  shown,
  statefulStand,
  toolRequests,
} from '../stateful/harness';

jest.setTimeout(30_000);

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** A real short wait: long enough for a cancel to reach the server. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 150));

/** What a counted group saw: each run of a handler and what it answered. */
interface Runs {
  started: number;
  answers: unknown[];
}

/** `group` with every handler counted. */
function counted(group: IHandlerGroup, runs: Runs): IHandlerGroup {
  return Object.assign({}, group, {
    getHandlers: (): HandlerEntry[] =>
      group.getHandlers().map((entry) => ({
        ...entry,
        handler: (async (...args: unknown[]) => {
          runs.started += 1;
          const answered = await (
            entry.handler as (...a: unknown[]) => Promise<unknown>
          )(...args);
          runs.answers.push(answered);
          return answered;
        }) as never,
      })),
  });
}

const SERVICE_DEFINITION = 'ZSD_STARTED';
const SOURCE = `define service ${SERVICE_DEFINITION} { expose ZI_X; }`;

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

it('UpdateServiceDefinition (activate: true) cancelled after its LOCK answered: LOCK, update, UNLOCK and the activation all sent; the handler ran once and answered', async () => {
  const runs: Runs = { started: 0, answers: [] };
  const s = await statefulStand([], {
    groups: [counted(oneToolGroup('UpdateServiceDefinition'), runs)],
  });
  try {
    const from = s.standIn.requests.length;
    // The LOCK is answered only after the cancel reached the server.
    const held = s.standIn.hold(isLock);
    const cancel = new AbortController();
    const call = s
      .callWith(
        'UpdateServiceDefinition',
        {
          service_definition_name: SERVICE_DEFINITION,
          source_code: SOURCE,
          activate: true,
        },
        cancel.signal,
      )
      .catch(() => 'the client stopped waiting');
    await held.arrived;
    cancel.abort('the user cancelled');
    expect(await call).toBe('the client stopped waiting');
    await pause();
    // A live call, its signal not aborted.
    expect(activeTools().map((t) => t.name)).toEqual([
      'UpdateServiceDefinition',
    ]);
    expect(activeTools()[0]?.signal.aborted).toBe(false);

    held.release();
    await until(() => activeTools().length === 0);

    const sent = toolRequests(s.standIn.requests.slice(from));
    const of = (match: (r: (typeof sent)[number]) => boolean) =>
      sent.filter(match);
    const update = of(
      (r) =>
        r.method === 'PUT' &&
        r.url.includes(SERVICE_DEFINITION.toLowerCase()) &&
        r.url.includes('/source/main'),
    );
    expect({
      lock: of(isLock).length,
      update: update.length,
      unlock: of(isUnlock).length,
      activation: of(isActivation).length,
      log: shown(sent),
    }).toMatchObject({ lock: 1, update: 1, unlock: 1, activation: 1 });
    const at = (match: (r: (typeof sent)[number]) => boolean) =>
      sent.findIndex(match);
    expect(at(isLock)).toBeLessThan(sent.indexOf(update[0] as never));
    expect(sent.indexOf(update[0] as never)).toBeLessThan(at(isUnlock));
    expect(at(isUnlock)).toBeLessThan(at(isActivation));
    // The handler ran once, to its end: its answer was produced.
    expect(runs.started).toBe(1);
    expect(runs.answers).toHaveLength(1);
    expect((runs.answers[0] as { isError?: boolean }).isError).toBeFalsy();
  } finally {
    await s.close();
  }
});

describe('no request of a started tool carries a signal', () => {
  let standIn: AdtStandIn;
  beforeEach(async () => {
    standIn = await adtStandIn();
  });
  afterEach(async () => {
    await standIn.close();
  });

  const settings = () => ({
    url: standIn.url,
    client: '100',
    authType: 'basic' as const,
  });

  async function inMemory(
    connect: (t: InMemoryTransport) => Promise<void>,
  ): Promise<Client> {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'no-signal', version: '1.0.0' });
    await Promise.all([connect(serverSide), client.connect(clientSide)]);
    return client;
  }

  /** The prototype that owns a built connection's `makeAdtRequest`. */
  function requestOwner(connection: object): {
    makeAdtRequest(options: IAbapRequestOptions): Promise<unknown>;
  } {
    let at: object | null = connection;
    while (at && !Object.hasOwn(at, 'makeAdtRequest')) {
      at = Object.getPrototypeOf(at);
    }
    if (!at) throw new Error('no makeAdtRequest on the connection');
    return at as never;
  }

  it("stdio's kept connection: two calls in flight at once, every request of theirs without a signal, both on the one connection", async () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    // The class stdio's connections are built of: its prototype's requests are watched.
    const owner = requestOwner(
      createAbapConnection(
        settings(),
        new BasicAuthProvider('SIGNAL_USER', 'signal-password'),
      ),
    );
    const seen: Array<{ on: unknown; options: IAbapRequestOptions }> = [];
    const original = owner.makeAdtRequest;
    jest.spyOn(owner, 'makeAdtRequest').mockImplementation(function (
      this: unknown,
      options: IAbapRequestOptions,
    ) {
      seen.push({ on: this, options });
      return original.call(this, options);
    });

    // stdio's provider is the same for the process's life.
    const provider = new BasicAuthProvider('SIGNAL_USER', 'signal-password');
    const server = new StdioServer(
      new CompositeHandlersRegistry([probeGroup()]),
      {
        settingsFor: async () => settings(),
        getProvider: async () => provider,
      },
    );
    const client = await inMemory((t) => server.start('dest', t));
    try {
      // Two calls in flight at once: the first's request held, the second
      // queued behind it in the main flow.
      const held = standIn.hold((r) => r.url === `${PROBE_PATH}one`);
      const one = client.callTool({
        name: 'ProbeAdt',
        arguments: { id: 'one' },
      });
      await held.arrived;
      const two = client.callTool({
        name: 'ProbeAdt',
        arguments: { id: 'two' },
      });
      await until(() => activeTools().length === 2);
      held.release();
      await Promise.all([one, two]);

      const probes = seen.filter((s) =>
        String(s.options.url).startsWith(PROBE_PATH),
      );
      expect(probes.map((s) => s.options.url)).toEqual([
        `${PROBE_PATH}one`,
        `${PROBE_PATH}two`,
      ]);
      expect(probes.filter((s) => 'signal' in s.options)).toEqual([]);
      // stdio keeps one connection: both calls ran on it.
      expect(new Set(probes.map((s) => s.on)).size).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("an injected connection: the tool is handed it with the consumer's own makeAdtRequest, which every request reaches, never with a signal", async () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(
      settings(),
      new BasicAuthProvider('SIGNAL_USER', 'signal-password'),
    );
    await connection.connect();
    const real = connection.makeAdtRequest.bind(connection);
    const received: IAbapRequestOptions[] = [];
    // The consumer's own function.
    const own = (options: IAbapRequestOptions) => {
      received.push(options);
      return real(options);
    };
    (connection as unknown as { makeAdtRequest: unknown }).makeAdtRequest = own;

    // What a tool is handed, read before any client of adt-clients wraps the
    // connection's request for its own content negotiation.
    const handed: Array<{ connection: boolean; request: boolean }> = [];
    const whoAmI: IHandlerGroup = {
      getName: () => 'who-am-i',
      registerHandlers: () => {},
      getHandlers: () => [
        {
          toolDefinition: {
            name: 'WhoAmI',
            description: 'reports the connection it was handed',
            inputSchema: { type: 'object', properties: {} },
          },
          // (context, args): the server hands a two-parameter handler its context.
          handler: (async (
            ctx: { connection: { makeAdtRequest: unknown } },
            _args: unknown,
          ) => {
            handed.push({
              connection: ctx.connection === connection,
              request: ctx.connection.makeAdtRequest === own,
            });
            return { content: [{ type: 'text', text: 'ok' }] };
          }) as never,
        } as never,
      ],
    } as never;
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: new CompositeHandlersRegistry([
        whoAmI,
        oneToolGroup('UpdateServiceDefinition'),
      ]),
      systemType: 'onprem',
      systemContextResolver: null,
      systemContext: { responsible: 'DEVELOPER', masterSystem: 'DEV' },
    });
    const client = await inMemory((t) => server.connect(t));
    try {
      await client.callTool({ name: 'WhoAmI', arguments: {} });
      const cancel = new AbortController();
      const held = standIn.hold(isLock);
      const call = client
        .callTool(
          {
            name: 'UpdateServiceDefinition',
            arguments: {
              service_definition_name: SERVICE_DEFINITION,
              source_code: SOURCE,
              activate: true,
            },
          },
          undefined,
          { signal: cancel.signal },
        )
        .catch(() => 'the client stopped waiting');
      await held.arrived;
      cancel.abort('the user cancelled');
      await call;
      held.release();
      await until(() => activeTools().length === 0);

      // The tool was handed the consumer's connection, its own function on it.
      expect(handed).toEqual([{ connection: true, request: true }]);
      expect(received.some((o) => String(o.url).includes('_action=LOCK'))).toBe(
        true,
      );
      expect(
        received.some((o) => String(o.url).includes('_action=UNLOCK')),
      ).toBe(true);
      expect(
        received.some((o) =>
          String(o.url).startsWith('/sap/bc/adt/activation'),
        ),
      ).toBe(true);
      expect(received.filter((o) => 'signal' in o)).toEqual([]);
    } finally {
      await client.close();
      await (connection as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
    }
  });

  it("a host factory's fresh connection: the factory called with no argument, its connection's requests without a signal", async () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const rfc = () =>
      Object.assign(recordingConnection(), {
        getConfig: () => ({
          url: 'https://sap.example.invalid',
          client: '100',
          connectionType: 'rfc',
        }),
        disconnect: jest.fn(async () => {}),
      });
    const injected = rfc();
    const calls: unknown[][] = [];
    const received: IAbapRequestOptions[] = [];
    const made: Array<ReturnType<typeof rfc>> = [];
    const factory = async (...args: unknown[]): Promise<IAbapConnection> => {
      calls.push(args);
      const fresh = rfc();
      const answer = fresh.makeAdtRequest.bind(fresh);
      fresh.makeAdtRequest = ((options: IAbapRequestOptions) => {
        received.push(options);
        return answer(options);
      }) as never;
      made.push(fresh);
      return fresh;
    };
    const context = {
      connection: null,
      logger: undefined,
    } as unknown as HandlerContext;
    const server = new EmbeddableMcpServer({
      connection: injected as unknown as AbapConnection,
      handlersRegistry: new CompositeHandlersRegistry([
        new CompactHandlersGroup(context, [
          compactReadOnlyEntries,
          compactModifyEntries,
        ]),
      ]),
      systemType: 'onprem',
      systemContextResolver: null,
      systemContext: { responsible: 'DEVELOPER', masterSystem: 'DEV' },
      freshConnection: factory,
    });
    const client = await inMemory((t) => server.connect(t));
    try {
      await client.callTool({
        // Over RFC a package is created in an ABAP session of its own.
        name: 'HandlerCreate',
        arguments: {
          object_type: 'PACKAGE',
          package_name: 'ZFRESH',
          super_package: 'ZROOT',
          description: 'd',
        },
      });
      expect(calls).toEqual([[]]);
      expect(received.length).toBeGreaterThan(0);
      expect(received.filter((o) => 'signal' in o)).toEqual([]);
      expect(injected.requests).toHaveLength(0);
      expect(made[0]?.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
    }
  });
});
