/**
 * A transport close that ends the session is the instance's close: an
 * embedder's `BaseMcpServer` on its own connected transport (the default
 * `transportCloseEndsSession`) — no launcher, no SSE wrapper — whose client
 * disconnects gets, in that tick, the instance latched, the logoff sent to
 * every connection it owns (its own and a tool's fresh one), the running
 * call interrupted and the held state let go (its idle bound never armed
 * again). A running handler's next fresh connection is refused before
 * anything is sent. Nothing here closes the instance but the transport.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { isLatched, resetProcessLatchForTests } from '../../../lib/activeTools';
import { isClosedInstanceRefusal } from '../../../lib/auth/failures';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { own, ownedConnections } from '../../../lib/ownedConnections';
import { openFreshConnection } from '../../../lib/packageSessions';
import type {
  InstanceState,
  StatePart,
} from '../../../lib/state/InstanceState';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  probeGroup,
} from '../../helpers/adtStandIn';
import { StandServer, silent, until } from '../backgroundRuns/harness';

jest.setTimeout(30_000);

const MAIN_READ = '/sap/bc/adt/mainread/one';
const LISTEN = '/sap/bc/adt/debugger/listen/one';
const SECOND = '/sap/bc/adt/second/one';

/** Held state that holds until the end: what arms the idle bound. */
const holding: StatePart = {
  holdsState: () => true,
  pending: () => false,
  failures: () => [],
  observe: () => {},
  dispose: async () => {},
};

interface Seen {
  /** What the second fresh connection's open threw. */
  second?: unknown;
}

/**
 * One request on the instance's own connection, a fresh connection of the
 * state's with a request held on it; then a second fresh connection.
 */
function holdThenOpen(seen: Seen): HandlerEntry {
  return {
    toolDefinition: {
      name: 'HoldThenOpen',
      description: 'HoldThenOpen',
      inputSchema: { type: 'object', properties: {} },
    },
    // Two parameters: the server hands a handler its context only then.
    handler: async (
      ctx: { connection: IAbapConnection; state: InstanceState },
      _args: unknown,
    ) => {
      await ctx.connection.makeAdtRequest({ url: MAIN_READ, method: 'GET' });
      const first = await openFreshConnection(ctx.connection, undefined);
      own(first, { role: 'state' });
      ctx.state.attach(holding);
      await first
        .makeAdtRequest({ url: LISTEN, method: 'GET' })
        .catch(() => undefined);
      try {
        const second = await openFreshConnection(ctx.connection, undefined);
        await second.makeAdtRequest({ url: SECOND, method: 'GET' });
      } catch (error) {
        seen.second = error;
      }
      return { content: [{ type: 'text', text: 'done' }] };
    },
  } as unknown as HandlerEntry;
}

let standIn: AdtStandIn;
let previousType: string | undefined;
beforeEach(async () => {
  resetProcessLatchForTests();
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  standIn = await adtStandIn();
});
afterEach(async () => {
  await standIn.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

function idleTimerOf(server: StandServer): unknown {
  return (server as unknown as { state: { idleTimer: unknown } }).state
    .idleTimer;
}

it('the client disconnects: the logoff at once for the instance’s own and the fresh connection, the next fresh connection refused, the state let go', async () => {
  const server = new StandServer({
    name: 'transport-close-instance',
    logger: silent,
    systemType: 'onprem',
  });
  server.use({
    settings: {
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'CLOSE_USER',
    },
    credential: new BasicAuthProvider('CLOSE_USER', 'close-password'),
  });
  const seen: Seen = {};
  server.register(
    new CompositeHandlersRegistry([probeGroup([holdThenOpen(seen)])]),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'transport-close', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const held = standIn.hold((r) => r.url.startsWith(LISTEN));
  const call = client
    .callTool({ name: 'HoldThenOpen', arguments: {} })
    .catch(() => 'the transport closed');
  await held.arrived;
  const mainSession = standIn.requests.find((r) =>
    r.url.startsWith(MAIN_READ),
  )?.session;
  const freshSession = standIn.requests.find((r) =>
    r.url.startsWith(LISTEN),
  )?.session;
  expect(mainSession).toBeDefined();
  expect(freshSession).toBeDefined();
  expect(freshSession).not.toBe(mainSession);
  expect(ownedConnections(server)).toHaveLength(2);
  const sessionsBefore = new Set(standIn.requests.map((r) => r.session));

  await client.close();
  // In the close's tick: latched, nothing owned any more.
  expect(isLatched(server)).toBe(true);
  expect(ownedConnections(server)).toEqual([]);
  expect(await call).toBe('the transport closed');
  // Both logoffs reach the system while the tool's request is still held.
  await until(
    () =>
      standIn.loggedOff().includes(mainSession as string) &&
      standIn.loggedOff().includes(freshSession as string),
  );
  expect(standIn.logoffs()).toBe(2);

  held.release();
  await until(() => seen.second !== undefined);
  expect(isClosedInstanceRefusal(seen.second)).toBe(true);
  await server.idle();
  // Nothing was sent for the second fresh connection: no new session, no request.
  expect(standIn.requests.some((r) => r.url.startsWith(SECOND))).toBe(false);
  expect(
    standIn.requests.filter(
      (r) => !sessionsBefore.has(r.session) && !isLogoff(r.url),
    ),
  ).toEqual([]);
  expect(ownedConnections(server)).toEqual([]);
  // The state was let go: the call's end does not arm the idle bound.
  expect(server.holdsState()).toBe(true);
  expect(idleTimerOf(server)).toBeUndefined();
  // One logoff each, whoever closes again.
  await server.close();
  expect(standIn.logoffs()).toBe(2);
});
