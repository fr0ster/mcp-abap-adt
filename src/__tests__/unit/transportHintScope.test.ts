/**
 * The transport hint knows what the call sent even when the failed request's
 * URL does not show it (fr0ster/mcp-abap-adt#314).
 *
 * Some writes send `corrNr` as query parameters (a service binding's create,
 * a metadata extension's create): the request trace keeps the URL alone, so
 * the URL says nothing was sent. The server runs every handler inside the
 * call-transport scope with the call's own `transport_request`; the failure
 * renderer reads it beside the URL.
 */

import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import {
  answer,
  TRANSPORT_ENTRY_HELD_WORDS,
  TRANSPORT_HINT_WORDS,
} from '../../lib/answer';
import {
  callTransportRequest,
  runWithCallTransport,
} from '../../lib/callTransport';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { project, terseWrite } from '../../lib/strategies/projections';
import { refusedResponse } from '../helpers/fakeClient';
import { withSystemInformation } from '../helpers/systemInformationStandIn';
import { stateSystemKind } from '../helpers/systemKind';

beforeEach(() => {
  stateSystemKind();
});

/** SAP's 019 naming SIDK900001, on a create whose URL carries no `corrNr`. */
const refusedCreate = () =>
  refusedResponse('Create failed', {
    response: { status: 400, data: '<exc/>' },
    request: { method: 'POST', url: '/sap/bc/adt/businessservices/bindings' },
    messages: [
      {
        type: 'E',
        text: 'Object R3TR SRVB OBJ is already locked in request SIDK900001',
        t100: {
          id: 'CTS_WBO_API',
          no: '019',
          values: ['R3TR SRVB OBJ', 'SIDK900001', 'SAPUSER01'],
        },
      },
    ],
  } as unknown as Partial<IAdtError>);

const handler = () =>
  answer(
    { tool: 'StubCreate', detail: 'terse' },
    async () => refusedCreate(),
    project('terse', terseWrite),
  );

const STUBS: HandlerEntry[] = [
  {
    toolDefinition: {
      name: 'StubCreate',
      description: 'creates an object',
      inputSchema: {
        type: 'object',
        properties: { transport_request: { type: 'string' } },
      },
    },
    handler: async (_context: unknown, _args: unknown) => handler(),
  } as unknown as HandlerEntry,
];

class StubGroup {
  getName() {
    return 'stub';
  }
  getHandlers() {
    return STUBS;
  }
  registerHandlers() {}
}

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0' });
    this.registerHandlers(
      new CompositeHandlersRegistry([new StubGroup() as any]),
    );
  }
  protected async getConnection(): Promise<any> {
    return withSystemInformation() as any;
  }
}

async function call(args: Record<string, unknown>) {
  const server = new TestServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  try {
    const result: any = await client.callTool({
      name: 'StubCreate',
      arguments: args,
    });
    return JSON.parse(result.content[0].text);
  } finally {
    await client.close();
  }
}

describe('through the server: the call’s own transport_request decides', () => {
  it('SAP names the request the call was given (not in the URL): the entry-held words, no transport_request', async () => {
    const payload = await call({ transport_request: 'SIDK900001' });
    expect(payload.hint).toEqual({ text: TRANSPORT_ENTRY_HELD_WORDS });
  });

  it('the call was given another request: the request SAP names, to pass', async () => {
    const payload = await call({ transport_request: 'SIDK900009' });
    expect(payload.hint).toEqual({
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });

  it('the call was given none: the request SAP names, to pass', async () => {
    const payload = await call({});
    expect(payload.hint).toEqual({
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });
});

describe('runWithCallTransport', () => {
  it.each([
    ['a request', { transport_request: 'SIDK900001' }, 'SIDK900001'],
    ['an empty string', { transport_request: '' }, undefined],
    ['blanks', { transport_request: '  ' }, undefined],
    ['a number', { transport_request: 7 }, undefined],
    ['no argument', {}, undefined],
    ['no arguments object', undefined, undefined],
  ])('keeps %s as the call’s request: %p', (_label, args, expected) => {
    expect(runWithCallTransport(args, () => callTransportRequest())).toBe(
      expected,
    );
  });

  it('is nothing outside a call', () => {
    expect(callTransportRequest()).toBeUndefined();
  });

  it('reaches the renderer of a handler run inside it', async () => {
    const result: any = await runWithCallTransport(
      { transport_request: 'sidk900001' },
      handler,
    );
    expect(JSON.parse(result.content[0].text).hint).toEqual({
      text: TRANSPORT_ENTRY_HELD_WORDS,
    });
  });
});
