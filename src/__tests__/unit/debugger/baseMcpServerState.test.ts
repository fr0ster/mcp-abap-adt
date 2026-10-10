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
