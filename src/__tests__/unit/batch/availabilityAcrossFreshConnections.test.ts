/**
 * Batch availability is the destination's, not a connection's (spec §11): a
 * listed long read runs each call on a fresh connection of its own
 * (`runLongCall` → `openFreshConnection`), so what one call learned from the
 * outer `404` reaches the next only through the destination record the
 * dispatch hands every context (`HandlerContext.batchAvailability`). Another
 * destination of the same instance has its own record and still sends its
 * envelope.
 *
 * A server built from a source of settings against the ADT stand-in; the
 * real connection factory, the real `AdtBatchConnection`.
 */
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { runPhase, withSequentialFallback } from '../../../lib/batch/phases';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { isLongTool } from '../../../lib/longTools';
import { endConnection } from '../../../lib/ownedConnections';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import {
  type AdtStandIn,
  adtStandIn,
  basicOf,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { envelopeResponse, innerRequests } from '../../helpers/batchEnvelope';
import { stateSystemKind } from '../../helpers/systemKind';

/** A listed long read: served on a fresh connection per call. */
const TOOL = 'GetPackageContents';
const ITEMS = ['ITEM_A', 'ITEM_B'] as const;
const BATCH_URL = '/sap/bc/adt/communication/batch';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

const get = async (item: string, connection: IAbapConnection) =>
  (
    await connection.makeAdtRequest<string>({
      url: `/sap/bc/adt/probe/${item.toLowerCase()}`,
      method: 'GET',
      timeout: 0,
    })
  ).status;

/** The listed tool, on batches where the destination has them. */
const longRead: HandlerEntry = {
  toolDefinition: {
    name: TOOL,
    description: 'reads two items',
    inputSchema: { type: 'object', properties: {} },
  } as never,
  handler: (async (context: HandlerContext, _args: unknown) => {
    const ran = await withSequentialFallback(
      context,
      async () => {
        await runPhase(context, ITEMS, get);
        return 'batched';
      },
      async () => {
        for (const item of ITEMS) await get(item, context.connection);
        return 'sequential';
      },
    );
    return { content: [{ type: 'text', text: ran }] };
  }) as never,
};

class StandServer extends BaseMcpServer {
  private source: { settings: SapConfig; credential: IAuthProvider };
  constructor(source: { settings: SapConfig; credential: IAuthProvider }) {
    super({
      name: 'availability-stand',
      version: '1.0.0',
      logger: silent,
      systemType: 'onprem',
      systemContextResolver: defaultSystemContextResolver,
    });
    this.source = source;
    stateSystemKind();
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => this.source },
      sessionId: 'availability-stand',
    });
    this.registerHandlers(
      new CompositeHandlersRegistry([
        {
          getName: () => 'availability',
          registerHandlers: () => {},
          getHandlers: () => [longRead],
        } as never,
      ]),
    );
  }
  /** From now on the source answers `source`. */
  answer(source: { settings: SapConfig; credential: IAuthProvider }): void {
    this.source = source;
  }
  /** Ends the instance's connection: the next call builds one for its source. */
  async endInstanceConnection(): Promise<void> {
    const connection = await this.getConnection(new AbortController().signal);
    await endConnection(connection);
  }
}

function destination(standIn: AdtStandIn, user: string, client: string) {
  return {
    settings: {
      url: standIn.url,
      client,
      authType: 'basic',
      username: user,
    } as SapConfig,
    credential: new BasicAuthProvider(user, 'availability-password'),
  };
}

/** The envelope answered part by part, every part `200`. */
function multipartAnswer(request: StandInRequest) {
  const parts = innerRequests({
    url: request.url,
    method: 'POST',
    timeout: 0,
    headers: { 'Content-Type': request.contentType ?? '' },
    data: request.body,
  });
  const answer = envelopeResponse(
    parts.map(() => ({ status: 200, statusText: 'OK', body: 'answered' })),
  );
  return {
    status: 200,
    headers: answer.headers as Record<string, string>,
    text: String(answer.data),
  };
}

let standIn: AdtStandIn;
let server: StandServer;
let client: Client;

const AUTH_A = basicOf('BATCH_USER_A', 'availability-password');

beforeEach(async () => {
  standIn = await adtStandIn();
  // Destination A has no communication batch; any other has one.
  standIn.respond(
    (r) => r.url.startsWith(BATCH_URL),
    (r) =>
      r.authorization === AUTH_A
        ? { status: 404, text: '' }
        : multipartAnswer(r),
  );
  server = new StandServer(destination(standIn, 'BATCH_USER_A', '100'));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'availability', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

afterEach(async () => {
  await client.close().catch(() => undefined);
  await server.terminalClose().catch(() => undefined);
  await standIn.close();
});

async function call(): Promise<string> {
  const answer = (await client.callTool(
    { name: TOOL, arguments: {} },
    undefined,
    { timeout: 30_000 },
  )) as { content?: Array<{ text?: string }> };
  return answer.content?.[0]?.text ?? '';
}

const envelopesOf = (authorization: string) =>
  standIn.requests.filter(
    (r) => r.url.startsWith(BATCH_URL) && r.authorization === authorization,
  );

const probeSessions = (authorization: string) =>
  new Set(
    standIn.requests
      .filter(
        (r) =>
          r.url.startsWith('/sap/bc/adt/probe/') &&
          r.authorization === authorization,
      )
      .map((r) => r.session),
  );

describe('batch availability across fresh connections', () => {
  it('is a listed long read', () => {
    expect(isLongTool(TOOL)).toBe(true);
  });

  it("after the first call's outer 404 the second call sends no envelope and runs sequentially", async () => {
    expect(await call()).toBe('sequential');
    expect(envelopesOf(AUTH_A)).toHaveLength(1);
    const firstSessions = probeSessions(AUTH_A);
    expect(firstSessions.size).toBe(1);
    // The envelope went on the first call's own connection.
    expect(firstSessions.has(envelopesOf(AUTH_A)[0]?.session ?? '')).toBe(true);

    expect(await call()).toBe('sequential');
    expect(envelopesOf(AUTH_A)).toHaveLength(1);
    // The second call ran on a fresh connection of its own.
    const sessions = probeSessions(AUTH_A);
    expect(sessions.size).toBe(2);
  });

  it('a call of another destination still sends its envelope', async () => {
    expect(await call()).toBe('sequential');
    expect(envelopesOf(AUTH_A)).toHaveLength(1);

    await server.endInstanceConnection();
    server.answer(destination(standIn, 'BATCH_USER_B', '200'));
    const authB = basicOf('BATCH_USER_B', 'availability-password');

    expect(await call()).toBe('batched');
    expect(envelopesOf(authB)).toHaveLength(1);
    expect(envelopesOf(AUTH_A)).toHaveLength(1);
  });
});
