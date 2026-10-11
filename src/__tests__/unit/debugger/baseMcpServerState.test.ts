import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { MockAbapConnection } from '../../../embeddable/MockAbapConnection';
import type { HandlerContext } from '../../../handlers/interfaces';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';

const make = () =>
  new EmbeddableMcpServer({
    connection: new MockAbapConnection() as any,
    exposition: ['readonly'],
  } as any);

describe('the server instance owns its state', () => {
  it('two instances, two handles; nothing held at first; dispose with nothing held resolves', async () => {
    const a = make();
    const b = make();
    expect(a.stateHandle).not.toBe(b.stateHandle);
    expect(a.holdsState()).toBe(false);
    await expect(a.dispose()).resolves.toBeUndefined();
  });
  it('the debugger is created once, on first use, and attached to the state', () => {
    const a = make();
    const d1 = (a as any).debuggerFor();
    expect((a as any).debuggerFor()).toBe(d1);
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
          inputSchema: { type: 'object', properties: {} },
        },
        handler: async (context: HandlerContext, _args: unknown) => {
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
    return {} as any;
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
    expect(server.seen).toHaveLength(1);
    let idle = false;
    const idling = server.idle().then(() => {
      idle = true;
    });
    await tick();
    expect(idle).toBe(false);
    g.open();
    await calling;
    await idling;
    expect(idle).toBe(true);
    await client.close();
  });

  it('stays pending while a call is still acquiring its connection', async () => {
    const conn = gate();
    const server = new GatedServer(Promise.resolve(), conn.opened);
    const client = await connected(server);
    const calling = client.callTool({ name: 'Gated', arguments: {} });
    for (let i = 0; i < 5; i++) await tick();
    expect(server.seen).toHaveLength(0); // still acquiring its connection
    let idle = false;
    const idling = server.idle().then(() => {
      idle = true;
    });
    await tick();
    expect(idle).toBe(false);
    conn.open();
    await calling;
    await idling;
    expect(idle).toBe(true);
    await client.close();
  });

  it("a call's context carries the instance state and its debugger", async () => {
    const server = new GatedServer(Promise.resolve());
    const client = await connected(server);
    await client.callTool({ name: 'Gated', arguments: {} });
    const [context] = server.seen;
    expect(context.state).toBe(server.state);
    expect(context.debugger?.()).toBe((server as any).debuggerFor());
    expect(server.holdsState()).toBe(false);
    await client.close();
  });
});

describe('the idle bound: a tool call is the user activity', () => {
  it('the call marks its start when it enters and its end when it settles — the connection wait included', async () => {
    const conn = gate();
    const handler = gate();
    const server = new GatedServer(handler.opened, conn.opened);
    const started = jest.spyOn(server.state, 'callStarted');
    const ended = jest.spyOn(server.state, 'callEnded');
    const client = await connected(server);
    const calling = client.callTool({ name: 'Gated', arguments: {} });
    for (let i = 0; i < 5 && started.mock.calls.length === 0; i++) await tick();
    expect(started).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled(); // still acquiring its connection
    conn.open();
    for (let i = 0; i < 5; i++) await tick();
    expect(ended).not.toHaveBeenCalled(); // the handler waits on the server
    handler.open();
    await calling;
    await server.idle();
    expect(ended).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it('an embedder passes the bound; under 30 is refused at construction', () => {
    const at = (stateIdleMinutes: number) =>
      new EmbeddableMcpServer({
        connection: new MockAbapConnection() as any,
        exposition: ['readonly'],
        stateIdleMinutes,
      } as any);
    expect(make().state.idleMinutes).toBe(30);
    expect(at(45).state.idleMinutes).toBe(45);
    expect(() => at(29)).toThrow(/at least 30/);
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
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  });
  let written: string[];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    written = [];
    spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
  });
  afterEach(() => spy.mockRestore());

  it("an embedder's explicit logger receives the state's lines when no state logger is given", () => {
    const log = logger();
    const server = new EmbeddableMcpServer({
      connection: new MockAbapConnection() as any,
      exposition: ['readonly'],
      logger: log,
    } as any);
    provoke(server);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('observer broke'),
    );
    expect(written.join('')).not.toContain('observer broke');
  });

  it('no logger given: stderr', () => {
    provoke(make());
    expect(written.join('')).toContain('observer broke');
  });

  it('an explicit state logger wins over the logger', () => {
    const log = logger();
    const lines: string[] = [];
    const server = new EmbeddableMcpServer({
      connection: new MockAbapConnection() as any,
      exposition: ['readonly'],
      logger: log,
      stateLogger: { error: (m: string) => lines.push(m) },
    } as any);
    provoke(server);
    expect(lines.join('')).toContain('observer broke');
    expect(log.error).not.toHaveBeenCalled();
  });
});
