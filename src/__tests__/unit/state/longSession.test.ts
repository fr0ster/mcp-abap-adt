/**
 * The long session (#308, spec §2): the `LongSession` part of an instance's
 * state, the open tools, where they are served, and how they meet batch mode.
 *
 * - The part holds state while open; its disposal (the idle bound, a
 *   shutdown) closes it.
 * - `SessionOpen` (full) and `HandlerSession` `action: 'open'` (compact) are
 *   served only on the Streamable HTTP binaries — every kind, the `-ro` ones
 *   included, marked `[read-only]`; stdio and SSE list neither.
 * - While a communication batch or a debugger batch is open, open runs at
 *   once, is not recorded, and leaves the batch open: as the batch's own
 *   control tools, it bypasses recording and its refusal of connectionless
 *   tools.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import * as connectionFactory from '../../../lib/connectionFactory';
import type { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { closeInstance } from '../../../lib/instanceClose';
import { LongSession } from '../../../lib/state/longSession';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
} from '../../../lib/toolSet';
import { declaredRequired, jsonAt, listedJson } from '../../helpers/listedJson';

// lib/connectionFactory's createAbapConnection replaced on the module that
// defines it (its callers read it at call time): a guard, nothing here may
// build a connection.
mock.method(connectionFactory, 'createAbapConnection', () => {
  throw new Error('no connection may be built here');
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };

const SETS: ReadonlyArray<readonly [string, ToolSet, string]> = [
  ['core', fullToolSet, 'SessionOpen'],
  ['core-ro', fullReadOnlyToolSet, 'SessionOpen'],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
      modify: compactModifyEntries,
    }),
    'HandlerSession',
  ],
  [
    'compact-ro',
    compactReadOnlyToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
    }),
    'HandlerSession',
  ],
];
const SESSION_TOOLS = ['SessionOpen', 'SessionClose', 'HandlerSession'];

const namesOf = (set: ToolSet, transport: ServedTransport) =>
  set
    .groups({ connection: undefined as never }, transport, { dataTools: false })
    .flatMap((group) => group.getHandlers())
    .map((entry) => entry.toolDefinition);

class SessionServer extends BaseMcpServer {
  constructor(
    registry: IHandlersRegistry,
    options: {
      batch?: InstanceBatch;
      longSession?: LongSession;
      stateHandleArgument?: boolean;
    },
  ) {
    super({
      name: 'long-session',
      version: '1.0.0',
      logger: silent as never,
      systemType: 'onprem',
      ...options,
    });
    this.registerHandlers(registry);
  }

  get handle(): string {
    return this.state.handle;
  }

  holds(): boolean {
    return this.state.holdsState();
  }
}

async function served(
  registry: IHandlersRegistry,
  options: {
    batch?: InstanceBatch;
    longSession?: LongSession;
    stateHandleArgument?: boolean;
  },
) {
  const server = new SessionServer(registry, options);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'long-session', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { server, client };
}

const answerOf = (result: unknown) => {
  const r = result as {
    content?: Array<{ text?: string }>;
    isError?: boolean;
  };
  return { text: r.content?.[0]?.text ?? '', isError: r.isError === true };
};

/** An open batch record whose connection sends nothing. */
const openRecord = () => ({
  connection: {
    execute: mock.fn(async () => undefined),
  } as unknown as AdtBatchConnection,
  target: new LateBoundConnection(),
  recorded: [],
});

describe('the LongSession part', () => {
  it('holds state while open, tells its observers, and its disposal closes it', async () => {
    const part = new LongSession();
    const changes: boolean[] = [];
    part.observe(() => changes.push(part.holdsState()));
    assert.equal(part.holdsState(), false);
    part.open();
    assert.equal(part.holdsState(), true);
    part.open(); // already open: nothing changes
    assert.deepStrictEqual(changes, [true]);
    assert.equal(part.pending(), false);
    assert.deepStrictEqual(part.failures(), []);
    await part.dispose();
    assert.equal(part.holdsState(), false);
    assert.deepStrictEqual(changes, [true, false]);
  });
});

describe('where the session tools are served', () => {
  for (const [_kind, set, tool] of SETS) {
    it(
      format('%s: served on Streamable HTTP alone, marked read-only', _kind),
      () => {
        const http = namesOf(set, 'http');
        const open = http.find((d) => d.name === tool);
        assert.equal(open?.description.startsWith('[read-only] '), true);
        for (const transport of ['stdio', 'sse'] as const) {
          const names = namesOf(set, transport).map((d) => d.name);
          assert.deepStrictEqual(
            names.filter((n) => SESSION_TOOLS.includes(n)),
            [],
          );
        }
      },
    );
  }

  it('the compact HandlerSession takes action open and close', () => {
    const [, set] = SETS[2] ?? [];
    const tool = namesOf(set as ToolSet, 'http').find(
      (d) => d.name === 'HandlerSession',
    );
    if (tool === undefined) throw new Error('no HandlerSession');
    const schema = listedJson(tool.inputSchema);
    assert.deepStrictEqual(jsonAt(schema, 'action').enum, ['open', 'close']);
    assert.deepStrictEqual(declaredRequired(tool.inputSchema), ['action']);
  });
});

describe('open on an instance', () => {
  const registry = () => registryOf(fullToolSet, 'http', { dataTools: false });

  it('answers the instance state_handle and the instance then holds state', async () => {
    const longSession = new LongSession();
    const { server, client } = await served(registry(), {
      batch: new InstanceBatch({ keepRawParts: false }),
      longSession,
    });
    assert.equal(server.holds(), false);
    const answer = answerOf(
      await client.callTool({ name: 'SessionOpen', arguments: {} }),
    );
    assert.equal(answer.isError, false);
    assert.deepStrictEqual(JSON.parse(answer.text), {
      state_handle: server.handle,
    });
    assert.equal(server.holds(), true);
  });

  it('without the host part it is refused, holding nothing', async () => {
    const { server, client } = await served(registry(), {});
    const answer = answerOf(
      await client.callTool({ name: 'SessionOpen', arguments: {} }),
    );
    assert.equal(answer.isError, true);
    assert.ok(answer.text.includes('long_session_unavailable'));
    assert.equal(server.holds(), false);
  });
});

describe('open while a batch is open', () => {
  const sets: ReadonlyArray<
    readonly [string, ToolSet, string, Record<string, unknown>]
  > = [
    ['full', fullToolSet, 'SessionOpen', {}],
    [
      'compact',
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        data: compactDataEntries,
        modify: compactModifyEntries,
      }),
      'HandlerSession',
      { action: 'open' },
    ],
  ];

  for (const [_label, set, tool, args] of sets) {
    it(
      format(
        '%s: in a communication batch it runs at once, is not recorded, and the batch stays open',
        _label,
      ),
      async () => {
        const batch = new InstanceBatch({ keepRawParts: false });
        const { server, client } = await served(
          registryOf(set, 'http', { dataTools: false }),
          {
            batch,
            longSession: new LongSession(),
          },
        );
        batch.begin('communication', openRecord());
        const answer = answerOf(
          await client.callTool({ name: tool, arguments: args }),
        );
        assert.equal(answer.isError, false);
        assert.deepStrictEqual(JSON.parse(answer.text), {
          state_handle: server.handle,
        });
        assert.equal(batch.mode(), 'communication');
        // Nothing recorded: the next number is still the first.
        assert.equal(batch.nextNumber(), 1);
      },
    );
  }

  for (const [_label, set, tool, args] of sets) {
    it(
      format(
        '%s: in a debugger batch it runs at once, is not recorded, and the batch stays open',
        _label,
      ),
      async () => {
        const batch = new InstanceBatch({ keepRawParts: false });
        const { server, client } = await served(
          registryOf(set, 'http', { dataTools: false }),
          {
            batch,
            longSession: new LongSession(),
          },
        );
        batch.begin('debugger', openRecord());
        const answer = answerOf(
          await client.callTool({ name: tool, arguments: args }),
        );
        assert.equal(answer.isError, false);
        assert.deepStrictEqual(JSON.parse(answer.text), {
          state_handle: server.handle,
        });
        assert.equal(batch.mode(), 'debugger');
        assert.equal(batch.nextNumber(), 1);
      },
    );
  }
});

describe('the host declaration of state_handle', () => {
  /** A tool whose schema is a zod object declaring its own state_handle. */
  const ownZodSchema: IHandlerGroup = {
    getName: () => 'own-zod',
    registerHandlers: () => {},
    getHandlers: (): HandlerEntry[] => [
      {
        toolDefinition: {
          name: 'EchoOwn',
          description: 'answers its arguments',
          inputSchema: z.object({ state_handle: z.string() }),
        } as never,
        call: (async (_context: unknown, args: unknown) => ({
          content: [{ type: 'text', text: JSON.stringify(args) }],
        })) as never,
        connectionless: true,
      },
    ],
  } as unknown as IHandlerGroup;

  it('strips the argument only where the declaration was added: a schema it cannot extend keeps what it declares', async () => {
    const { client } = await served(
      new CompositeHandlersRegistry([ownZodSchema]),
      { stateHandleArgument: true },
    );
    const answer = answerOf(
      await client.callTool({
        name: 'EchoOwn',
        arguments: { state_handle: 'H' },
      }),
    );
    assert.equal(answer.isError, false);
    assert.deepStrictEqual(JSON.parse(answer.text), { state_handle: 'H' });
  });
});

describe('close on an instance', () => {
  /** A debugger that holds a debug session, as a listener or a stopped debuggee does. */
  const heldDebugger = () =>
    ({
      holdsState: () => true,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      dispose: async () => {},
    }) as unknown as DebuggerInstance;

  /** A server whose debugger is the host's own (`debuggerFor` overridden, as an embedder may). */
  class DebuggerServer extends SessionServer {
    private own: DebuggerInstance | undefined;

    protected override debuggerFor(): DebuggerInstance {
      if (this.own === undefined) {
        this.own = heldDebugger();
        this.state.attach(this.own);
      }
      return this.own;
    }
  }

  /** A tool that takes the instance's debugger, as every debugger tool does. */
  const takeDebugger: IHandlerGroup = {
    getName: () => 'take-debugger',
    registerHandlers: () => {},
    getHandlers: (): HandlerEntry[] => [
      {
        toolDefinition: {
          name: 'TakeDebugger',
          description: 'takes the debugger',
          inputSchema: z.object({}),
        } as never,
        call: (async (
          context: { debugger?: () => unknown },
          _args: unknown,
        ) => {
          context.debugger?.();
          return { content: [{ type: 'text', text: 'taken' }] };
        }) as never,
        connectionless: true,
      },
    ],
  } as unknown as IHandlerGroup;

  const sessionGroups = () =>
    fullToolSet
      .groups({ connection: undefined as never }, 'http', { dataTools: false })
      .filter((group) =>
        group
          .getHandlers()
          .some((entry) => entry.toolDefinition.name === 'SessionClose'),
      );

  it('names a held debug session: debug_session true', async () => {
    const server = new DebuggerServer(
      new CompositeHandlersRegistry([...sessionGroups(), takeDebugger]),
      { longSession: new LongSession() },
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'long-session', version: '1.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const taken = answerOf(
      await client.callTool({ name: 'TakeDebugger', arguments: {} }),
    );
    assert.deepStrictEqual(taken, { text: 'taken', isError: false });
    assert.equal(server.holds(), true);

    const answer = answerOf(
      await client.callTool({ name: 'SessionClose', arguments: {} }),
    );
    assert.equal(answer.isError, false);
    assert.deepStrictEqual(JSON.parse(answer.text), {
      closed: true,
      held: { locks: 0, batch: false, envelopes: 0, debug_session: true },
    });
    assert.equal(server.closeAsked(), true);
  });

  for (const [_label, tool, args] of [
    ['full', 'SessionClose', {}],
    ['compact', 'HandlerSession', { action: 'close' }],
  ] as const) {
    it(
      format(
        '%s: in a debugger batch it runs at once, is not recorded, and the instance close drops the batch',
        _label,
      ),
      async () => {
        const set =
          tool === 'SessionClose'
            ? fullToolSet
            : compactToolSetOf({
                readOnly: compactReadOnlyEntries,
                data: compactDataEntries,
                modify: compactModifyEntries,
              });
        const batch = new InstanceBatch({ keepRawParts: false });
        const { server, client } = await served(
          registryOf(set, 'http', { dataTools: false }),
          {
            batch,
            longSession: new LongSession(),
          },
        );
        batch.begin('debugger', openRecord());
        const answer = answerOf(
          await client.callTool({ name: tool, arguments: { ...args } }),
        );
        assert.equal(answer.isError, false);
        assert.deepStrictEqual(JSON.parse(answer.text), {
          closed: true,
          held: { locks: 0, batch: true, envelopes: 0, debug_session: false },
        });
        // Run at once, not recorded: the batch is still open, its first number unused.
        assert.equal(batch.mode(), 'debugger');
        assert.equal(batch.nextNumber(), 1);
        assert.equal(server.closeAsked(), true);
        // The host's close once the answer is written (the pool's `closeOut`).
        await closeInstance(server);
        assert.equal(batch.mode(), 'off');
        assert.equal(batch.holdsState(), false);
      },
    );
  }
});
