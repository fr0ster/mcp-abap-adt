/**
 * Handlers do not re-check what their schema declares: the MCP boundary does,
 * once. A debug tool called through it with a wrongly typed argument is refused
 * by the SDK, and the handler is never called.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { TOOL_DEFINITION as AmdpSetBreakpoints } from '../../../handlers/debugger/debug/handleAmdpDebugSetBreakpoints';
import { TOOL_DEFINITION as SetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { TOOL_DEFINITION as SetStackPosition } from '../../../handlers/debugger/debug/handleDebugSetStackPosition';
import { TOOL_DEFINITION as Wait } from '../../../handlers/debugger/debug/handleDebugWait';
import { TOOL_DEFINITION as SnapshotGet } from '../../../handlers/debugger/debug/handleMemorySnapshotGet';
import { TOOL_DEFINITION as VirtualFolders } from '../../../handlers/system/low/handleGetVirtualFolders';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';

class BoundaryServer extends BaseMcpServer {
  readonly handler = jest.fn(async (_context: unknown, _args: unknown) => ({
    isError: false,
    content: [{ type: 'text', text: 'called' }],
  }));
  constructor() {
    super({ name: 'boundary', version: '1.0.0' });
    const entries: HandlerEntry[] = [
      Wait,
      SetStackPosition,
      SetBreakpoints,
      AmdpSetBreakpoints,
      SnapshotGet,
      VirtualFolders,
    ].map((toolDefinition) => ({ toolDefinition, handler: this.handler }));
    this.registerHandlers(
      new CompositeHandlersRegistry([
        {
          getName: () => 'boundary',
          getHandlers: () => entries,
          registerHandlers: () => {},
        } as any,
      ]),
    );
  }
  protected async getConnection(): Promise<any> {
    return {};
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

const textOf = (r: any) =>
  (r.content as { text: string }[]).map((c) => c.text).join('\n');

describe('the MCP boundary validates debug tool arguments', () => {
  const handle = '0'.repeat(32);
  it.each([
    [
      'a string for a number',
      Wait.name,
      { state_handle: handle, hold_seconds: 'ten' },
    ],
    [
      'a value outside an enum',
      Wait.name,
      { state_handle: handle, detail: 'everything' },
    ],
    ['a missing required argument', Wait.name, {}],
    [
      'a fraction for an integer',
      SetStackPosition.name,
      { state_handle: handle, position: 1.5 },
    ],
    [
      'a message breakpoint without its fields',
      SetBreakpoints.name,
      { state_handle: handle, breakpoints: [{ message: {} }] },
    ],
    [
      'a message breakpoint that is a string',
      SetBreakpoints.name,
      { state_handle: handle, breakpoints: [{ message: 'x' }] },
    ],
    [
      'a message breakpoint with only an id',
      SetBreakpoints.name,
      { state_handle: handle, breakpoints: [{ message: { id: 'A' } }] },
    ],
    [
      'a line given as a string inside a breakpoint',
      SetBreakpoints.name,
      { state_handle: handle, breakpoints: [{ object_name: 'A', line: '3' }] },
    ],
    [
      'an empty breakpoint list',
      SetBreakpoints.name,
      { state_handle: handle, breakpoints: [] },
    ],
    [
      'an empty AMDP breakpoint list',
      AmdpSetBreakpoints.name,
      { state_handle: handle, breakpoints: [] },
    ],
    [
      'a limit below its minimum',
      SnapshotGet.name,
      { snapshot_id: 'S1', view: 'ranking', max_objects: 0 },
    ],
  ])('refuses %s; the handler is not called', async (_, name, args) => {
    const server = new BoundaryServer();
    const client = await connected(server);
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Input validation error/);
    expect(server.handler).not.toHaveBeenCalled();
    await client.close();
  });

  it('accepts a complete message breakpoint', async () => {
    const server = new BoundaryServer();
    const client = await connected(server);
    const breakpoints = [{ message: { id: 'A', number: '001', type: 'E' } }];
    const result = await client.callTool({
      name: SetBreakpoints.name,
      arguments: { state_handle: handle, breakpoints },
    });
    expect(result.isError).toBeFalsy();
    expect(server.handler).toHaveBeenCalledTimes(1);
    expect(server.handler.mock.calls[0][1]).toMatchObject({ breakpoints });
    await client.close();
  });

  it('a non-debug tool with nested input accepts what it accepted before, unknown keys dropped at every level as at the top', async () => {
    const server = new BoundaryServer();
    const client = await connected(server);
    const preselection = [{ facet: 'package', values: ['A', 'B'] }];
    const result = await client.callTool({
      name: VirtualFolders.name,
      arguments: {
        preselection: [{ ...preselection[0], extra: 1 }],
        unknown_top: true,
      },
    });
    expect(result.isError).toBeFalsy();
    const received = server.handler.mock.calls[0][1] as Record<string, unknown>;
    expect(received.preselection).toEqual(preselection);
    expect(received).not.toHaveProperty('unknown_top');
    await client.close();
  });

  it('passes well-typed arguments through to the handler', async () => {
    const server = new BoundaryServer();
    const client = await connected(server);
    const result = await client.callTool({
      name: SetStackPosition.name,
      arguments: { state_handle: handle, position: 2 },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe('called');
    expect(server.handler).toHaveBeenCalledTimes(1);
    await client.close();
  });
});
