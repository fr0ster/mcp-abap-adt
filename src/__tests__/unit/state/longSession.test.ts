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
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(() => {
    throw new Error('no connection may be built here');
  }),
  systemKindOf: jest.fn(() => 'onprem'),
}));

import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
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

const silent = { info() {}, debug() {}, warn() {}, error() {} };

const SETS: ReadonlyArray<readonly [string, ToolSet, string]> = [
  ['core', fullToolSet, 'SessionOpen'],
  ['core-ro', fullReadOnlyToolSet, 'SessionOpen'],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      modify: compactModifyEntries,
    }),
    'HandlerSession',
  ],
  [
    'compact-ro',
    compactReadOnlyToolSetOf(compactReadOnlyEntries),
    'HandlerSession',
  ],
];
const SESSION_TOOLS = ['SessionOpen', 'SessionClose', 'HandlerSession'];

const namesOf = (set: ToolSet, transport: ServedTransport) =>
  set
    .groups({ connection: undefined as never }, transport)
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
    execute: jest.fn(async () => undefined),
  } as unknown as AdtBatchConnection,
  target: new LateBoundConnection(),
  recorded: [],
});

describe('the LongSession part', () => {
  it('holds state while open, tells its observers, and its disposal closes it', async () => {
    const part = new LongSession();
    const changes: boolean[] = [];
    part.observe(() => changes.push(part.holdsState()));
    expect(part.holdsState()).toBe(false);
    part.open();
    expect(part.holdsState()).toBe(true);
    part.open(); // already open: nothing changes
    expect(changes).toEqual([true]);
    expect(part.pending()).toBe(false);
    expect(part.failures()).toEqual([]);
    await part.dispose();
    expect(part.holdsState()).toBe(false);
    expect(changes).toEqual([true, false]);
  });
});

describe('where the session tools are served', () => {
  it.each(SETS)(
    '%s: served on Streamable HTTP alone, marked read-only',
    (_kind, set, tool) => {
      const http = namesOf(set, 'http');
      const open = http.find((d) => d.name === tool);
      expect(open?.description.startsWith('[read-only] ')).toBe(true);
      for (const transport of ['stdio', 'sse'] as const) {
        const names = namesOf(set, transport).map((d) => d.name);
        expect(names.filter((n) => SESSION_TOOLS.includes(n))).toEqual([]);
      }
    },
  );

  it('the compact HandlerSession takes action open and close', () => {
    const [, set] = SETS[2] ?? [];
    const tool = namesOf(set as ToolSet, 'http').find(
      (d) => d.name === 'HandlerSession',
    );
    const schema = tool?.inputSchema as {
      properties: Record<string, { enum?: string[] }>;
      required?: string[];
    };
    expect(schema.properties.action?.enum).toEqual(['open', 'close']);
    expect(schema.required).toEqual(['action']);
  });
});

describe('open on an instance', () => {
  const registry = () => registryOf(fullToolSet, 'http');

  it('answers the instance state_handle and the instance then holds state', async () => {
    const longSession = new LongSession();
    const { server, client } = await served(registry(), {
      batch: new InstanceBatch({ keepRawParts: false }),
      longSession,
    });
    expect(server.holds()).toBe(false);
    const answer = answerOf(
      await client.callTool({ name: 'SessionOpen', arguments: {} }),
    );
    expect(answer.isError).toBe(false);
    expect(JSON.parse(answer.text)).toEqual({ state_handle: server.handle });
    expect(server.holds()).toBe(true);
  });

  it('without the host part it is refused, holding nothing', async () => {
    const { server, client } = await served(registry(), {});
    const answer = answerOf(
      await client.callTool({ name: 'SessionOpen', arguments: {} }),
    );
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain('long_session_unavailable');
    expect(server.holds()).toBe(false);
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
        modify: compactModifyEntries,
      }),
      'HandlerSession',
      { action: 'open' },
    ],
  ];

  it.each(sets)(
    '%s: in a communication batch it runs at once, is not recorded, and the batch stays open',
    async (_label, set, tool, args) => {
      const batch = new InstanceBatch({ keepRawParts: false });
      const { server, client } = await served(registryOf(set, 'http'), {
        batch,
        longSession: new LongSession(),
      });
      batch.begin('communication', openRecord());
      const answer = answerOf(
        await client.callTool({ name: tool, arguments: args }),
      );
      expect(answer.isError).toBe(false);
      expect(JSON.parse(answer.text)).toEqual({ state_handle: server.handle });
      expect(batch.mode()).toBe('communication');
      // Nothing recorded: the next number is still the first.
      expect(batch.nextNumber()).toBe(1);
    },
  );

  it.each(sets)(
    '%s: in a debugger batch it runs at once, is not recorded, and the batch stays open',
    async (_label, set, tool, args) => {
      const batch = new InstanceBatch({ keepRawParts: false });
      const { server, client } = await served(registryOf(set, 'http'), {
        batch,
        longSession: new LongSession(),
      });
      batch.begin('debugger', openRecord());
      const answer = answerOf(
        await client.callTool({ name: tool, arguments: args }),
      );
      expect(answer.isError).toBe(false);
      expect(JSON.parse(answer.text)).toEqual({ state_handle: server.handle });
      expect(batch.mode()).toBe('debugger');
      expect(batch.nextNumber()).toBe(1);
    },
  );
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
        handler: (async (_context: unknown, args: unknown) => ({
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
    expect(answer.isError).toBe(false);
    expect(JSON.parse(answer.text)).toEqual({ state_handle: 'H' });
  });
});
