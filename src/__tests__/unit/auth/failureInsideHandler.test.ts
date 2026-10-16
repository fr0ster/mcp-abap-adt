/**
 * An auth failure inside a handler. A credential SAP refused (its `401`) is
 * the failure adt-clients answers, carrying the connection's own message —
 * its fixed words and its hint — as it is, with no secret. A credential the
 * provider refused before SAP was asked rejects from the member as the
 * connection's `AuthRefusedError` (adt-clients 33) and is answered as the
 * credential failure, `authentication_failed`. Over a connection the server
 * built, and over one the consumer injected, which the server does not wrap.
 */

import { authError, render } from '@mcp-abap-adt/auth-errors';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { adtStandIn } from '../../helpers/adtStandIn';
import { recordingConnection } from '../../helpers/recordingConnection';
import { stateSystemKind } from '../../helpers/systemKind';
import { StandServer, silent } from '../backgroundRuns/harness';
import { oneToolGroup } from '../stateful/harness';

jest.setTimeout(30_000);

const PASSWORD = 'never-in-an-answer-1234';

interface Result {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

async function clientOn(
  connect: (
    transport: ReturnType<typeof InMemoryTransport.createLinkedPair>[1],
  ) => Promise<void>,
): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'inside-handler', version: '1.0.0' });
  await Promise.all([connect(serverSide), client.connect(clientSide)]);
  return client;
}

const payloadOf = (result: Result): Record<string, unknown> =>
  JSON.parse(result.content?.[0]?.text ?? '{}') as Record<string, unknown>;

describe('an auth failure inside a handler reaches the client in the connection’s words', () => {
  it('a server-built connection: the system refuses the credential, the answer is the connection’s message as it is', async () => {
    const standIn = await adtStandIn();
    const server = new StandServer({
      name: 'inside-handler',
      logger: silent,
      systemType: 'onprem',
    });
    server.use({
      settings: {
        url: standIn.url,
        client: '100',
        authType: 'basic',
        username: 'INSIDE_USER',
      },
      credential: new BasicAuthProvider('INSIDE_USER', PASSWORD),
    });
    server.register(new CompositeHandlersRegistry([oneToolGroup('ReadClass')]));
    standIn.answer((r) => r.url.toLowerCase().includes('zcl_refused'), 401);
    const client = await clientOn((t) => server.connect(t));
    try {
      const result = (await client.callTool({
        name: 'ReadClass',
        arguments: { class_name: 'ZCL_REFUSED' },
      })) as Result;
      expect(result.isError).toBe(true);
      const payload = payloadOf(result);
      const words = render('credential-refused', {
        credential: 'user-password',
      });
      expect(payload.origin).toBe('connection');
      expect(payload.message).toBe(
        words.hint !== undefined
          ? `${words.reason} — ${words.hint}`
          : words.reason,
      );
      // The server did not recognise or re-render it.
      expect(payload.error).toBeUndefined();
      const text = JSON.stringify(result);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(
        Buffer.from(`INSIDE_USER:${PASSWORD}`).toString('base64'),
      );
    } finally {
      await client.close().catch(() => undefined);
      await server.terminalClose();
      await standIn.close();
    }
  });

  it('an injected connection: its AuthRefusedError, SAP never asked, is the credential failure in its own words, and the connection was not wrapped', async () => {
    stateSystemKind();
    const refusal = authError.connection({
      problem: 'refused-after-renewal',
      at: 'request',
    });
    const consumers = recordingConnection();
    // The system answers who the user is; the tool's own request is refused.
    const makeAdtRequest = async (options: { url: string }) => {
      if (options.url.includes('systeminformation')) {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          data: JSON.stringify({ userName: 'INJECTED_USER', systemID: 'INJ' }),
        };
      }
      throw new AuthRefusedError(refusal, 'request');
    };
    const connection = {
      ...consumers,
      makeAdtRequest,
    } as unknown as IAbapConnection;
    let seen: HandlerContext['connection'] | undefined;
    let held: HandlerContext | undefined;
    const capture: IHandlerGroup = {
      getName: () => 'capture',
      setContext: (context: HandlerContext) => {
        held = context;
      },
      registerHandlers: () => {},
      getHandlers: (): HandlerEntry[] => [
        {
          toolDefinition: {
            name: 'CaptureConnection',
            description: 'records the connection a handler is given',
            inputSchema: { type: 'object', properties: {} },
          } as never,
          handler: (async () => {
            seen = held?.connection;
            return { content: [{ type: 'text', text: 'seen' }] };
          }) as never,
        },
      ],
    } as never;
    const server = new EmbeddableMcpServer({
      connection,
      handlersRegistry: new CompositeHandlersRegistry([
        oneToolGroup('ReadClass'),
        capture,
      ]),
      systemType: 'onprem',
      logger: silent,
      systemContextResolver: defaultSystemContextResolver,
    });
    const client = await clientOn((t) => server.connect(t));
    try {
      const result = (await client.callTool({
        name: 'ReadClass',
        arguments: { class_name: 'ZCL_REFUSED' },
      })) as Result;
      expect(result.isError).toBe(true);
      const payload = payloadOf(result);
      const words = render('connection', {
        problem: 'refused-after-renewal',
        at: 'request',
      });
      // adt-clients 33 rejects with the refusal as it came: the chain's
      // answer, in the connection's own fixed words and hint; nothing of the
      // server's, and not dressed as SAP's answer.
      expect(payload.error).toBe('authentication_failed');
      expect(payload.kind).toBe('connection');
      expect(payload.message).toBe(words.reason);
      expect(payload.hint).toBe(words.hint);
      expect(payload.origin).toBeUndefined();

      await client.callTool({ name: 'CaptureConnection', arguments: {} });
      expect(seen).toBe(connection);
    } finally {
      await client.close().catch(() => undefined);
      await server.close?.();
    }
  });
});
