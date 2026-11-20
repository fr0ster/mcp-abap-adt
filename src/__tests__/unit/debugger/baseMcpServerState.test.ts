import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { MockAbapConnection } from '../../../embeddable/MockAbapConnection';
import type { HandlerContext } from '../../../handlers/interfaces';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { assertThrows } from '../../helpers/assertions';
import { withSystemInformation } from '../../helpers/systemInformationStandIn';
import { stateSystemKind } from '../../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const make = () =>
  new EmbeddableMcpServer({
    connection: withSystemInformation(new MockAbapConnection()) as any,
    exposition: ['readonly'],
  } as any);

describe('the server instance owns its state', () => {
  it('two instances, two handles; nothing held at first; dispose with nothing held resolves', async () => {
    const a = make();
    const b = make();
    assert.notEqual(a.stateHandle, b.stateHandle);
    assert.equal(a.holdsState(), false);
    assert.equal(await a.dispose(), undefined);
  });
  it('the debugger is created once, on first use, and attached to the state', () => {
    const a = make();
    const d1 = (a as any).debuggerFor();
    assert.equal((a as any).debuggerFor(), d1);
  });
});

function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((r) => {
    open = r;
  });
  return { opened, open };
}

class GatedServer extends BaseMcpServer {
  readonly seen: HandlerContext[] = [];
  constructor(
    private readonly handlerGate: Promise<void>,
    private readonly connectionGate: Promise<void> = Promise.resolve(),
  ) {
    super({ name: 'gated', version: '1.0.0' });
    const entries: HandlerEntry[] = [
      {
        toolDefinition: {
          name: 'Gated',
          description: 'waits for a gate',
          inputSchema: z.object({}),
        },
        call: async (context: HandlerContext, _args: unknown) => {
          this.seen.push(context);
          await this.handlerGate;
          return { isError: false, content: [{ type: 'text', text: 'done' }] };
        },
      },
    ];
    this.registerHandlers(
      new CompositeHandlersRegistry([
        {
          getName: () => 'gated',
          getHandlers: () => entries,
          registerHandlers: () => {},
        } as any,
      ]),
    );
  }
  protected async getConnection(): Promise<any> {
    await this.connectionGate;
    return withSystemInformation() as any;
  }
}

async function connected(server: BaseMcpServer) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 't', version: '1.0.0' },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

const tick = () => new Promise((r) => setImmediate(r));

describe('idle(): every tool call of the instance has settled', () => {
  it('stays pending while a handler awaits a gate, resolves after it opens', async () => {
    const g = gate();
    const server = new GatedServer(g.opened);
    const client = await connected(server);
    const calling = client.callTool({ name: 'Gated', arguments: {} });
    for (let i = 0; i < 5 && server.seen.length === 0; i++) await tick();
    assert.equal(server.seen.length, 1);
    let idle = false;
    const idling = server.idle().then(() => {
      idle = true;
    });
    await tick();
    assert.equal(idle, false);
    g.open();
    await calling;
    await idling;
    assert.equal(idle, true);
    await client.close();
  });

  it('stays pending while a call is still acquiring its connection', async () => {
    const conn = gate();
    const server = new GatedServer(Promise.resolve(), conn.opened);
    const client = await connected(server);
    const calling = client.callTool({ name: 'Gated', arguments: {} });
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(server.seen.length, 0); // still acquiring its connection
    let idle = false;
    const idling = server.idle().then(() => {
      idle = true;
    });
    await tick();
    assert.equal(idle, false);
    conn.open();
    await calling;
    await idling;
    assert.equal(idle, true);
    await client.close();
  });

  it("a call's context carries the instance state and its debugger", async () => {
    const server = new GatedServer(Promise.resolve());
    const client = await connected(server);
    await client.callTool({ name: 'Gated', arguments: {} });
    const [context] = server.seen;
    assert.equal(context.state, server.state);
    assert.equal(context.debugger?.(), (server as any).debuggerFor());
    assert.equal(server.holdsState(), false);
    await client.close();
  });
});

describe('the idle bound: a tool call is the user activity', () => {
  it('the call marks its start when it enters and its end when it settles — the connection wait included', async (t) => {
    const conn = gate();
    const handler = gate();
    const server = new GatedServer(handler.opened, conn.opened);
    const started = t.mock.method(server.state, 'callStarted');
    const ended = t.mock.method(server.state, 'callEnded');
    const client = await connected(server);
    const calling = client.callTool({ name: 'Gated', arguments: {} });
    for (let i = 0; i < 5 && started.mock.callCount() === 0; i++) await tick();
    assert.equal(started.mock.callCount(), 1);
    assert.equal(ended.mock.callCount(), 0); // still acquiring its connection
    conn.open();
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(ended.mock.callCount(), 0); // the handler waits on the server
    handler.open();
    await calling;
    await server.idle();
    assert.equal(ended.mock.callCount(), 1);
    await client.close();
  });

  it('an embedder passes the bound; under 30 is refused at construction', () => {
    const at = (stateIdleMinutes: number) =>
      new EmbeddableMcpServer({
        connection: withSystemInformation(new MockAbapConnection()) as any,
        exposition: ['readonly'],
        stateIdleMinutes,
      } as any);
    assert.equal(make().state.idleMinutes, 30);
    assert.equal(at(45).state.idleMinutes, 45);
    assertThrows(() => at(29), /at least 30/);
  });
});

describe('where the state reports', () => {
  /** An observer that throws on the next change makes the state report. */
  const provoke = (server: BaseMcpServer) => {
    server.state.onChange(() => {
      throw new Error('observer broke');
    });
    server.state.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      dispose: async () => {},
      observe: () => {},
    });
  };
  const logger = () => ({
    info: mock.fn(),
    error: mock.fn(),
    warn: mock.fn(),
    debug: mock.fn(),
  });
  let written: string[];
  let restoreStderr: () => void;
  beforeEach(() => {
    written = [];
    const spy = mock.method(process.stderr, 'write', (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
    restoreStderr = () => spy.mock.restore();
  });
  afterEach(() => restoreStderr());

  it("an embedder's explicit logger receives the state's lines when no state logger is given", () => {
    const log = logger();
    const server = new EmbeddableMcpServer({
      connection: withSystemInformation(new MockAbapConnection()) as any,
      exposition: ['readonly'],
      logger: log,
    } as any);
    provoke(server);
    // toHaveBeenCalledWith(stringContaining): a call of one string argument
    // holding the words.
    assert.ok(
      log.error.mock.calls.some((c) => {
        const [line, ...rest] = c.arguments as unknown[];
        return (
          rest.length === 0 &&
          typeof line === 'string' &&
          line.includes('observer broke')
        );
      }),
    );
    assert.ok(!written.join('').includes('observer broke'));
  });

  it('no logger given: stderr', () => {
    provoke(make());
    assert.ok(written.join('').includes('observer broke'));
  });

  it('an explicit state logger wins over the logger', () => {
    const log = logger();
    const lines: string[] = [];
    const server = new EmbeddableMcpServer({
      connection: withSystemInformation(new MockAbapConnection()) as any,
      exposition: ['readonly'],
      logger: log,
      stateLogger: { error: (m: string) => lines.push(m) },
    } as any);
    provoke(server);
    assert.ok(lines.join('').includes('observer broke'));
    assert.equal(log.error.mock.callCount(), 0);
  });
});
