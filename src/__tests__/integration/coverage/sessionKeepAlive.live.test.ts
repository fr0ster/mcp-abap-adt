/**
 * The session keep-alive, live (24.0.1): SAP ends an idle server's SAP
 * session after about 35–60 minutes, and the first call after the pause
 * failed (a POST `403 CSRF token validation failed`, a LOCK
 * `SESSION_REPLACED`). The server's keep-alive sends one `GET` of the ADT
 * discovery on the connection it built and holds once a whole interval
 * passed without a request.
 *
 * An in-process server builds its own connection from the configured
 * destination, with an interval of a few seconds. A first call logs on; the
 * case then waits — on the ping's answer, never on a timer — until the
 * keep-alive's discovery request went out and was answered `2xx`; a second
 * call runs in the same SAP session: the `SAP_SESSIONID` cookie is the same
 * before and after, compared here and never printed.
 *
 * Over an RFC connection to SAP the same case runs (the controller points
 * `MCP_TEST_CONFIG` at the on-premise RFC config): the ping goes out and is
 * answered `2xx`, and the call after the pause succeeds. An RFC connection
 * carries no session cookie, so there the session is not compared.
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { isRfcConnection } from '../../../lib/connectionKind';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { SESSION_KEEP_ALIVE_URL } from '../../../lib/sessionKeepAlive';
import { getTestDestination } from '../helpers/authHelpers';
import { configuredSystemKind } from '../helpers/configHelpers';
import { systemsDescribe } from '../helpers/live';
import { credentialRefused } from '../helpers/refusalGuard';
import { McpSession } from '../helpers/testers/hardMode';

/** A few seconds: the case idles past it once. */
const INTERVAL_MS = 3_000;

/** The `SAP_SESSIONID_<SID>_<client>` cookie's value in `cookies`, read by plain code. */
function sessionIdOf(cookies: string | null | undefined): string | undefined {
  if (cookies === null || cookies === undefined) return undefined;
  for (const part of cookies.split(';')) {
    const pair = part.trim();
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq).startsWith('SAP_SESSIONID')) {
      return pair.slice(eq + 1);
    }
  }
  return undefined;
}

/** What the probe tool saw on the server's connection. */
const seen: {
  connection: IAbapConnection | undefined;
  sessions: Array<string | undefined>;
} = { connection: undefined, sessions: [] };

/** Resolves with the status of the first keep-alive answer on the server's connection. */
let pinged: (status: number) => void = () => {};
const pingAnswered = new Promise<number>((resolve) => {
  pinged = resolve;
});

/**
 * Watches the keep-alive's request on `connection` (the connector the
 * server built, under its request mark): every request still goes on as it
 * was; the discovery's answer resolves `pingAnswered`.
 */
function watchPing(connection: IAbapConnection): void {
  const send = connection.makeAdtRequest.bind(connection);
  connection.makeAdtRequest = async (
    options: IAbapRequestOptions,
  ): Promise<IAdtWireResponse> => {
    try {
      const answer = await send(options);
      if (options.url === SESSION_KEEP_ALIVE_URL) pinged(answer.status);
      return answer;
    } catch (error) {
      if (options.url === SESSION_KEEP_ALIVE_URL) pinged(0);
      throw error;
    }
  };
}

/** `KeepAliveSession {}`: one read on the server's connection, then its session id as seen. */
const probe: HandlerEntry = {
  toolDefinition: {
    name: 'KeepAliveSession',
    description: 'reads the system information on its connection',
    inputSchema: z.object({}),
  },
  call: (async (context: { connection: IAbapConnection }) => {
    const connection = context.connection;
    if (seen.connection === undefined) {
      seen.connection = connection;
      watchPing(connection);
    }
    await connection.makeAdtRequest({
      url: '/sap/bc/adt/core/http/systeminformation',
      method: 'GET',
      timeout: 0,
      headers: {
        Accept: 'application/vnd.sap.adt.core.http.systeminformation.v1+json',
      },
    });
    seen.sessions.push(sessionIdOf(connection.sessionCookies?.()));
    return { content: [{ type: 'text', text: 'read' }] };
  }) as never,
} as unknown as HandlerEntry;

const group: IHandlerGroup = {
  getName: () => 'keep-alive-live',
  registerHandlers: () => {},
  getHandlers: () => [probe],
} as unknown as IHandlerGroup;

class KeepAliveServer extends BaseMcpServer {
  async use(): Promise<void> {
    const destination = await getTestDestination();
    if (destination === null) {
      throw new Error('the test config names no destination');
    }
    this.setConnectionContext({
      kind: 'built',
      source: {
        resolve: async () => ({
          settings: destination.settings,
          credential: destination.credential,
        }),
      },
    });
    this.registerHandlers(new CompositeHandlersRegistry([group]));
  }
}

systemsDescribe(['onprem', 'cloud'], 'the session keep-alive, live', () => {
  it('pings the held connection once idle, and the session stays the same', async (t) => {
    if (credentialRefused()) {
      t.skip('the run stopped on a credential refusal');
      return;
    }
    const kind = configuredSystemKind();
    const server = new KeepAliveServer({
      name: 'keep-alive-live',
      systemType: kind === 'cloud' ? 'cloud' : 'onprem',
      sessionKeepAliveMs: INTERVAL_MS,
    });
    await server.use();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const session = new McpSession(clientSide);
    await server.connect(serverSide);
    await session.initialize();
    try {
      const first = await session.callTool('KeepAliveSession', {});
      assert.notEqual(first.isError, true, 'the first call');
      const connection = seen.connection;
      assert.ok(connection !== undefined);
      const rfc = isRfcConnection(connection);
      const before = seen.sessions[0];
      if (!rfc) {
        assert.ok(before !== undefined, 'the first call has a session cookie');
      }
      // Idle: the keep-alive's ping goes out after one to two intervals.
      const status = await pingAnswered;
      assert.ok(status >= 200 && status < 300, 'the ping was answered 2xx');
      const second = await session.callTool('KeepAliveSession', {});
      assert.notEqual(second.isError, true, 'the call after the pause');
      // Compared, never printed; an RFC connection has no cookie to compare.
      if (!rfc) assert.ok(seen.sessions[1] === before, 'the same SAP session');
    } finally {
      await session.close();
      await server.terminalClose();
    }
  });
});
