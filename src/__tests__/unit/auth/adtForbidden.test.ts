/**
 * An ADT authorization error is not a credential refusal: a user who logged on
 * but may not work with an object gets a `403` with an ADT exception body. The
 * tool answers the method's error as it is — SAP's status, `adt_type`, T100
 * messages and document, in the fields the strategy put them — plus the step
 * the handler was doing; its `error` is not `authentication_failed`, and the
 * credential was not asked to renew — over a connection the server built and
 * over one the consumer injected.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import { StandServer, silent } from '../backgroundRuns/harness';
import { oneToolGroup } from '../stateful/harness';

jest.setTimeout(30_000);

const SAP_TEXT = 'No authorization to display the object ZCL_FORBIDDEN';
const EXCEPTION = `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNoAuthorization"/><message lang="EN">${SAP_TEXT}</message></exc:exception>`;

interface Result {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

/** A basic credential that counts what it is asked after a refusal. */
function watched(): { provider: IAuthProvider; asked: () => number } {
  const basic = new BasicAuthProvider('FORBIDDEN_USER', 'forbidden-password');
  let rejected = 0;
  const provider: IAuthProvider = {
    kind: basic.kind,
    prepare: () => basic.prepare(),
    establish: (target) => basic.establish(target),
    authorize: (target) => basic.authorize(target),
    rejected: (rejection) => {
      rejected += 1;
      return basic.rejected(rejection);
    },
  };
  return { provider, asked: () => rejected };
}

async function readForbidden(
  connect: (
    transport: ReturnType<typeof InMemoryTransport.createLinkedPair>[1],
  ) => Promise<void>,
): Promise<{ result: Result; payload: Record<string, unknown> }> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'forbidden', version: '1.0.0' });
  await Promise.all([connect(serverSide), client.connect(clientSide)]);
  try {
    const result = (await client.callTool({
      name: 'GetClass',
      arguments: { class_name: 'ZCL_FORBIDDEN' },
    })) as Result;
    return {
      result,
      payload: JSON.parse(result.content?.[0]?.text ?? '{}') as Record<
        string,
        unknown
      >,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function expectSapsWords(
  result: Result,
  payload: Record<string, unknown>,
  asked: number,
): void {
  expect(result.isError).toBe(true);
  // SAP's answer, as it is.
  expect(payload.status).toBe(403);
  expect(payload.adt_type).toBe('ExceptionResourceNoAuthorization');
  expect(payload.raw_body).toBe(EXCEPTION);
  expect(JSON.stringify(payload.messages)).toContain(SAP_TEXT);
  // GetClass sends one request: the method's error as it is, no step.
  expect(payload.step).toBeUndefined();
  // Not a credential refusal.
  expect(payload.error).toBeUndefined();
  expect(payload.kind).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('authentication_failed');
  // The credential was not asked: no renewal.
  expect(asked).toBe(0);
}

describe('a 403 with an ADT exception body', () => {
  it('a server-built connection: the method error as it is with its step, not authentication_failed, no renewal asked', async () => {
    const standIn = await adtStandIn();
    const { provider, asked } = watched();
    const server = new StandServer({
      name: 'forbidden',
      logger: silent,
      systemType: 'onprem',
    });
    server.use({
      settings: {
        url: standIn.url,
        client: '100',
        authType: 'basic',
        username: 'FORBIDDEN_USER',
      },
      credential: provider,
    });
    server.register(new CompositeHandlersRegistry([oneToolGroup('GetClass')]));
    standIn.answer(
      (r) => r.url.toLowerCase().includes('zcl_forbidden'),
      403,
      EXCEPTION,
    );
    try {
      const { result, payload } = await readForbidden((t) => server.connect(t));
      expectSapsWords(result, payload, asked());
    } finally {
      await server.terminalClose();
      await standIn.close();
    }
  });

  it('an injected connection: the same', async () => {
    stateSystemKind();
    const standIn = await adtStandIn();
    const { provider, asked } = watched();
    const connection = createAbapConnection(
      {
        url: standIn.url,
        client: '100',
        authType: 'basic',
        username: 'FORBIDDEN_USER',
      },
      provider,
    );
    await connection.connect();
    standIn.answer(
      (r) => r.url.toLowerCase().includes('zcl_forbidden'),
      403,
      EXCEPTION,
    );
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: new CompositeHandlersRegistry([
        oneToolGroup('GetClass'),
      ]),
      systemType: 'onprem',
      logger: silent,
      systemContextResolver: defaultSystemContextResolver,
    });
    try {
      const { result, payload } = await readForbidden((t) => server.connect(t));
      expectSapsWords(result, payload, asked());
    } finally {
      await (connection as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    }
  });
});
