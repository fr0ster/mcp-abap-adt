import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import * as z from 'zod';
import { assertMatchObject } from '../helpers/assertions';
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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
import { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { project, terseWrite } from '../../lib/strategies/projections';
import { refusedResponse } from '../helpers/fakeClient';
import { withSystemInformation } from '../helpers/systemInformationStandIn';
import { stateSystemKind } from '../helpers/systemKind';
import { toolAnswer } from '../helpers/toolAnswer';

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
      inputSchema: z.object({ transport_request: z.string().optional() }),
    },
    call: async (_context: unknown, _args: unknown) => handler(),
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
    assert.deepStrictEqual(payload.hint, { text: TRANSPORT_ENTRY_HELD_WORDS });
  });

  it('the call was given another request: the request SAP names, to pass', async () => {
    const payload = await call({ transport_request: 'SIDK900009' });
    assert.deepStrictEqual(payload.hint, {
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });

  it('the call was given none: the request SAP names, to pass', async () => {
    const payload = await call({});
    assert.deepStrictEqual(payload.hint, {
      transport_request: 'SIDK900001',
      text: TRANSPORT_HINT_WORDS,
    });
  });
});

describe('runWithCallTransport', () => {
  // `%p` is pretty-format's rendering of the arguments, written out per row.
  for (const [_label, args, shown, expected] of [
    [
      'a request',
      { transport_request: 'SIDK900001' },
      '{"transport_request": "SIDK900001"}',
      'SIDK900001',
    ],
    [
      'an empty string',
      { transport_request: '' },
      '{"transport_request": ""}',
      undefined,
    ],
    [
      'blanks',
      { transport_request: '  ' },
      '{"transport_request": "  "}',
      undefined,
    ],
    [
      'a number',
      { transport_request: 7 },
      '{"transport_request": 7}',
      undefined,
    ],
    ['no argument', {}, '{}', undefined],
  ] satisfies Array<
    [string, Record<string, unknown>, string, string | undefined]
  >) {
    it(format('keeps %s as the call’s request: %s', _label, shown), () => {
      assert.equal(
        runWithCallTransport(args, () => callTransportRequest()),
        expected,
      );
    });
  }

  it('is nothing outside a call', () => {
    assert.equal(callTransportRequest(), undefined);
  });

  it('reaches the renderer of a handler run inside it', async () => {
    const result: any = await runWithCallTransport(
      { transport_request: 'sidk900001' },
      handler,
    );
    assert.deepStrictEqual(JSON.parse(result.content[0].text).hint, {
      text: TRANSPORT_ENTRY_HELD_WORDS,
    });
  });
});

/** A group registered on its own (`BaseHandlerGroup.registerHandlers`). */
class OwnGroup extends BaseHandlerGroup {
  protected groupName = 'own';
  getHandlers(): HandlerEntry[] {
    return STUBS;
  }
}

describe('the other ways a handler is invoked enter the same scope', () => {
  it('a group registered on its own: the call’s transport_request decides', async () => {
    const group = new OwnGroup({ connection: {} } as never);
    let callback: ((args: unknown) => Promise<any>) | undefined;
    group.registerHandlers({
      registerTool: (_n: string, _c: unknown, cb: typeof callback) => {
        callback = cb;
      },
    } as unknown as McpServer);
    const sent = await callback?.({ transport_request: 'SIDK900001' });
    assert.deepStrictEqual(JSON.parse(sent.content[0].text).hint, {
      text: TRANSPORT_ENTRY_HELD_WORDS,
    });
    const other = await callback?.({ transport_request: 'SIDK900009' });
    assertMatchObject(JSON.parse(other.content[0].text).hint, {
      transport_request: 'SIDK900001',
    });
  });

  it('an exporter’s handed-out handler: the call’s transport_request decides', async () => {
    const exporter = new HandlerExporter();
    const entry: HandlerEntry = {
      ...STUBS[0],
      call: async (_context: unknown, _args: unknown) => handler(),
    };
    (exporter as unknown as { handlerGroups: unknown[] }).handlerGroups = [
      {
        getName: () => 'stub',
        getHandlers: () => [entry],
      },
    ];
    const [exported] = exporter.getHandlerEntries();
    const args = { transport_request: 'SIDK900001' };
    const result = toolAnswer(
      await exported?.call(noConnectionContext(), args),
    );
    assert.deepStrictEqual(JSON.parse(result.content[0]?.text ?? '{}').hint, {
      text: TRANSPORT_ENTRY_HELD_WORDS,
    });
  });
});
