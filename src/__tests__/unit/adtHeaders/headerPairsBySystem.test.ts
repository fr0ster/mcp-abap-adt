import { utilDocuments } from '@mcp-abap-adt/adt-clients';
/**
 * The corrected header pairs are the system's, not the credentials'
 * (`AdtHeaderPairs`): the dispatch hands every call the port of its
 * destination's target system (`HandlerContext.adtHeaders`). Two
 * destinations to the same system — other users, other credentials — share
 * what one learned; a destination to another system has its own. The owner
 * is the host's, shared by its instances.
 *
 * A server built from a source of settings against the ADT stand-in; the
 * real connection factory and a real adt-clients member (`getWhereUsed`).
 */
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { AdtHeaderPairs } from '../../../lib/adtHeaders/AdtHeaderPairs';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { createAdtClient } from '../../../lib/clients';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { endConnection } from '../../../lib/ownedConnections';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';

const TOOL = 'HeaderPairsProbe';
const OP = 'utils.getWhereUsed';
const DEFAULT = DEFAULT_ADT_HEADERS[OP];
const NEWER =
  'application/vnd.sap.adt.repository.usagereferences.result.v2+xml';
const WHERE_USED = '/sap/bc/adt/repository/informationsystem/usageReferences';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** A tool whose one request is a where-used, through the wrapper. */
const probe: HandlerEntry = {
  toolDefinition: {
    name: TOOL,
    description: 'reads a where-used list',
    inputSchema: { type: 'object', properties: {} },
  } as never,
  handler: (async (context: HandlerContext, _args: unknown) => {
    const answer = await withAdtHeaders(context, OP, (headers) =>
      createAdtClient(context.connection)
        .getUtils(utilDocuments)
        .getWhereUsed(
          { object_name: 'ZCL_PROBE', object_type: 'CLAS/OC' },
          { headers },
        ),
    );
    return { content: [{ type: 'text', text: answer.ok ? 'ok' : 'failed' }] };
  }) as never,
};

class StandServer extends BaseMcpServer {
  private source: { settings: SapConfig; credential: IAuthProvider };
  constructor(
    source: { settings: SapConfig; credential: IAuthProvider },
    adtHeaderPairs: AdtHeaderPairs,
  ) {
    super({
      name: 'header-pairs-stand',
      version: '1.0.0',
      logger: silent,
      systemType: 'onprem',
      systemContextResolver: defaultSystemContextResolver,
      adtHeaderPairs,
    });
    this.source = source;
    stateSystemKind();
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => this.source },
      sessionId: 'header-pairs-stand',
    });
    this.registerHandlers(
      new CompositeHandlersRegistry([
        {
          getName: () => 'header-pairs',
          registerHandlers: () => {},
          getHandlers: () => [probe],
        } as never,
      ]),
    );
  }
  answer(source: { settings: SapConfig; credential: IAuthProvider }): void {
    this.source = source;
  }
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
    credential: new BasicAuthProvider(user, `${user.toLowerCase()}-password`),
  };
}

let standIn: AdtStandIn;
let server: StandServer;
let client: Client;

beforeEach(async () => {
  standIn = await adtStandIn();
  // The system serves the where-used only as NEWER.
  standIn.respond(
    (r) => r.url.startsWith(WHERE_USED),
    (r) =>
      r.accept === NEWER
        ? { status: 200, text: '<usageReferences/>' }
        : {
            status: 406,
            text: `<exc:exception><message>The message content is not acceptable. Accepted content types: ${NEWER}</message></exc:exception>`,
          },
  );
  server = new StandServer(
    destination(standIn, 'PAIRS_USER_A', '100'),
    new AdtHeaderPairs(),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'header-pairs', version: '1.0.0' });
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

const acceptsSent = () =>
  standIn.requests
    .filter((r) => r.url.startsWith(WHERE_USED))
    .map((r) => r.accept);

describe('header pairs by system', () => {
  it('a 406 is corrected once; the next call of the destination sends the corrected Accept', async () => {
    expect(await call()).toBe('ok');
    expect(acceptsSent()).toEqual([DEFAULT.accept, NEWER]);
    expect(await call()).toBe('ok');
    expect(acceptsSent()).toEqual([DEFAULT.accept, NEWER, NEWER]);
  });

  it('another destination to the same system — another user and credential — sends the corrected pair directly', async () => {
    expect(await call()).toBe('ok');
    await server.endInstanceConnection();
    server.answer(destination(standIn, 'PAIRS_USER_B', '100'));
    expect(await call()).toBe('ok');
    expect(acceptsSent()).toEqual([DEFAULT.accept, NEWER, NEWER]);
  });

  it('a destination to another system has pairs of its own', async () => {
    expect(await call()).toBe('ok');
    await server.endInstanceConnection();
    server.answer(destination(standIn, 'PAIRS_USER_A', '200'));
    expect(await call()).toBe('ok');
    expect(acceptsSent()).toEqual([
      DEFAULT.accept,
      NEWER,
      DEFAULT.accept,
      NEWER,
    ]);
  });
});
