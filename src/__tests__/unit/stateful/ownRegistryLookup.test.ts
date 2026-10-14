/**
 * A tool its own registry registered (`registerAllTools`, not a
 * `CompositeHandlersRegistry`) gets the same system lookup before it runs as
 * a handler group's tool: on ABAP Cloud the instance's connection is asked
 * `systeminformation` before the callback is called. A failed lookup — a
 * refused request (`system_lookup_failed`) or an answer naming no user
 * (`system_without_user`) — is that call's error answer and the callback is
 * not called; nothing is kept, so the next call asks again, and once the
 * system answers, the callback runs once, after the lookup, inside the
 * known system context. On a built instance (http-style) and on an
 * embedder's injected connection alike.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import { getEffectiveSystemContext } from '../../../lib/systemContext';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { clientOf, StandServer, silent } from '../backgroundRuns/harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const probe = (id: string) => `/sap/bc/adt/probe/own-${id}`;
const sent = (standIn: AdtStandIn, id: string) =>
  standIn.requests.filter((r) => r.url === probe(id)).length;

/** What each callback call saw of the known system context. */
type Seen = Array<string | undefined>;

/**
 * A registry that registers `OwnProbe` itself: its callback sends one probe
 * request through the instance's connection (the server it was handed).
 */
function ownRegistry(seen: Seen): IHandlersRegistry {
  return {
    registerAllTools(server: McpServer) {
      server.registerTool(
        'OwnProbe',
        {
          description: 'registered by its own registry',
          inputSchema: { id: z.string() },
        },
        async (args: { id: string }, extra: { signal: AbortSignal }) => {
          seen.push(getEffectiveSystemContext().responsible);
          const reach = server as unknown as {
            getConnection(signal: AbortSignal): Promise<{
              makeAdtRequest(options: object): Promise<unknown>;
            }>;
            connectionReleased(connection: object): void;
          };
          const connection = await reach.getConnection(extra.signal);
          try {
            await connection.makeAdtRequest({
              url: probe(args.id),
              method: 'GET',
              timeout: 10_000,
            });
          } finally {
            reach.connectionReleased(connection);
          }
          return { content: [{ type: 'text', text: args.id }] };
        },
      );
    },
    registerTool() {},
    getRegisteredTools: () => ['OwnProbe'],
  };
}

class OwnStand extends StandServer {
  registerOwn(registry: IHandlersRegistry): void {
    this.registerHandlers(registry);
  }
}

const settings = (standIn: AdtStandIn) => ({
  url: standIn.url,
  client: '100',
  authType: 'basic' as const,
  username: 'LOOKUP_USER',
});
const credential = () =>
  new BasicAuthProvider('LOOKUP_USER', 'lookup-password');

/** A built instance, as http and sse build theirs. */
async function builtInstance(standIn: AdtStandIn, seen: Seen) {
  const server = new OwnStand({
    name: 'own-registry-lookup',
    logger: silent,
    systemType: 'cloud',
  });
  server.use({ settings: settings(standIn), credential: credential() });
  server.registerOwn(ownRegistry(seen));
  const client = await clientOf(server);
  return {
    call: client.call,
    close: async () => {
      await client.close();
      await server.terminalClose();
    },
  };
}

/** An embedder's instance on its own injected connection. */
async function embedderInstance(standIn: AdtStandIn, seen: Seen) {
  const connection = createAbapConnection(settings(standIn), credential());
  await connection.connect();
  const server = new EmbeddableMcpServer({
    connection: connection as never,
    handlersRegistry: ownRegistry(seen),
    systemType: 'cloud',
    logger: silent,
  });
  const client = await clientOf(server);
  return {
    call: client.call,
    close: async () => {
      await client.close();
      await (connection as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
    },
  };
}

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

const INSTANCES: Array<
  [string, typeof builtInstance | typeof embedderInstance]
> = [
  ['a built instance (http-style)', builtInstance],
  ['an embedder instance (injected connection)', embedderInstance],
];

const FAILED: Array<
  [string, string, (standIn: AdtStandIn, failing: () => boolean) => void]
> = [
  [
    'refused',
    'system_lookup_failed',
    (standIn, failing) => standIn.answer((r) => isLookup(r) && failing(), 500),
  ],
  [
    'answered without a user',
    'system_without_user',
    (standIn, failing) =>
      standIn.body(
        (r) => isLookup(r) && failing(),
        JSON.stringify({ systemID: 'CLD' }),
      ),
  ],
];

describe.each(INSTANCES)('%s', (_instance, open) => {
  it.each(FAILED)(
    'the lookup %s: the call answers %s, the callback not called; the next call asks again and runs once',
    async (_how, code, fail) => {
      const standIn = await adtStandIn();
      let failing = true;
      fail(standIn, () => failing);
      standIn.body(
        isLookup,
        JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
      );
      const seen: Seen = [];
      const s = await open(standIn, seen);
      try {
        const first = await s.call('OwnProbe', { id: 'one' });
        expect(first.isError).toBe(true);
        expect(first.payload).toMatchObject({ error: code });
        expect(seen).toHaveLength(0);
        expect(sent(standIn, 'one')).toBe(0);

        const again = await s.call('OwnProbe', { id: 'again' });
        expect(again.payload).toMatchObject({ error: code });
        expect(seen).toHaveLength(0);
        expect(standIn.requests.filter(isLookup)).toHaveLength(2);

        failing = false;
        const second = await s.call('OwnProbe', { id: 'two' });
        expect(second.isError).toBe(false);
        expect(standIn.requests.filter(isLookup)).toHaveLength(3);
        // Called once, after the lookup, inside the known system context.
        expect(seen).toEqual(['CLOUD_USER']);
        expect(sent(standIn, 'two')).toBe(1);
        const lookup = standIn.requests.map(isLookup).lastIndexOf(true);
        expect(
          standIn.requests.findIndex((r) => r.url === probe('two')),
        ).toBeGreaterThan(lookup);

        // Known from now on: asked no more.
        await s.call('OwnProbe', { id: 'three' });
        expect(standIn.requests.filter(isLookup)).toHaveLength(3);
        expect(sent(standIn, 'three')).toBe(1);
      } finally {
        await s.close();
        await standIn.close();
      }
    },
  );
});
