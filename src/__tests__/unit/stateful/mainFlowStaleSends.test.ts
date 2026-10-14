/**
 * A send through `onMainConnection` that waits behind a call losing the SAP
 * session (C15 round 7): it takes its connection inside the flow, so it goes
 * out on the replacement — never on the connection captured before the wait.
 *
 * Against the stand-in, which gives every connection an ABAP session of its
 * own: a running call loses its session while (a) a background run's caller
 * lookup and (b) a debugger start's request-user lookup wait. Each lookup
 * goes out in the replacement's session, not the lost one.
 */

import {
  BasicAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { liveDebugPorts } from '../../../lib/debugger/ports';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { isEnded } from '../../../lib/ownedConnections';
import {
  type AdtStandIn,
  adtStandIn,
  PROBE_PATH,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  clientOf,
  StandServer,
  shippedGroups,
  silent,
} from '../backgroundRuns/harness';

jest.setTimeout(30_000);

const LOSE_PATH = '/sap/bc/adt/probe-lose/';
const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');

/** Sends one request, then finds its session lost and fails. */
const loseSession: HandlerEntry = {
  toolDefinition: {
    name: 'LoseSession',
    description: 'LoseSession',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  handler: (async (
    context: {
      connection: {
        makeAdtRequest(o: object): Promise<unknown>;
        isConnected?: () => boolean;
      };
    },
    args: { id: string },
  ) => {
    await context.connection.makeAdtRequest({
      url: `${LOSE_PATH}${args.id}`,
      method: 'GET',
      timeout: 10_000,
    });
    context.connection.isConnected = () => false;
    throw new Error('the session was lost');
  }) as never,
} as unknown as HandlerEntry;

/** As a debugger start in user mode: the request user, through the port. */
const startListener: HandlerEntry = {
  toolDefinition: {
    name: 'DebugStartListener',
    description: 'DebugStartListener',
    inputSchema: { type: 'object', properties: {} },
  },
  handler: (async (context: HandlerContext, _args: unknown) => {
    const user = await liveDebugPorts().requestUser(context);
    return { content: [{ type: 'text', text: user }] };
  }) as never,
} as unknown as HandlerEntry;

/** The gated out-of-flow call: the connection it holds, and its gate. */
const gate: { holder?: object; open: () => void; opened: Promise<void> } = {
  open: () => {},
  opened: Promise.resolve(),
};
function closeGate(): void {
  gate.holder = undefined;
  gate.opened = new Promise<void>((resolve) => {
    gate.open = resolve;
  });
}

/** As a `DebugWait` holding: outside the flow, on the instance's connection. */
const gatedWait: HandlerEntry = {
  toolDefinition: {
    name: 'DebugWait',
    description: 'DebugWait',
    inputSchema: { type: 'object', properties: {} },
  },
  handler: (async (context: HandlerContext, _args: unknown) => {
    gate.holder = context.connection;
    await gate.opened;
    return { content: [{ type: 'text', text: 'waited' }] };
  }) as never,
} as unknown as HandlerEntry;

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

let previousType: string | undefined;
beforeEach(() => {
  closeGate();
  previousType = process.env.SAP_SYSTEM_TYPE;
  // `systeminformation` exists only on ABAP Cloud: the identity lookups are
  // asked only there.
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function stand(source: {
  settings: SapConfig;
  credential: IAuthProvider;
}) {
  const server = new StandServer({
    name: 'stale-sends',
    logger: silent,
    systemType: 'cloud',
    backgroundRuns: new InMemoryBackgroundRuns(),
  });
  server.use(source);
  server.register(shippedGroups());
  server.register(
    new CompositeHandlersRegistry([
      probeGroup([loseSession, startListener, gatedWait]),
    ]),
  );
  const client = await clientOf(server);
  return {
    call: client.call,
    close: async () => {
      await client.close();
      await server.terminalClose();
    },
  };
}

/**
 * Warms the connection, then runs `waiting` behind a call that loses it.
 * While the waiting send holds the replacement R (its lookup held at the
 * stand-in), an out-of-flow call (`DebugWait`, gated) takes R too. Then R is
 * lost and replaced: it must end with exactly one logoff, and only once its
 * last holder — the gated call — lets go. A send that keeps R (no release)
 * leaves it open; one that gives R back twice ends it under the gated call.
 */
async function behindALostSession(
  standIn: AdtStandIn,
  s: Awaited<ReturnType<typeof stand>>,
  waiting: () => Promise<unknown>,
): Promise<{
  lostSession: string;
  lookups: StandInRequest[];
  replacedLogoffs: number;
  endedUnderHolder: boolean;
}> {
  await s.call('ProbeAdt', { id: 'warm' });
  const lostSession =
    standIn.requests.find((r) => r.url === `${PROBE_PATH}warm`)?.session ?? '';
  const held = standIn.hold((r) => r.url === `${LOSE_PATH}a`);
  const losing = s.call('LoseSession', { id: 'a' });
  await held.arrived;
  const from = standIn.requests.length;
  const lookupHeld = standIn.hold(isLookup);
  const waited = waiting();
  await new Promise((resolve) => setTimeout(resolve, 100));
  // It waits behind the losing call: nothing of it reached SAP yet.
  expect(standIn.requests.slice(from).filter(isLookup)).toEqual([]);
  held.release();
  await losing;

  // The send holds the replacement R; a gated out-of-flow call takes it too.
  await lookupHeld.arrived;
  const replacedSession =
    standIn.requests.slice(from).find(isLookup)?.session ?? '';
  const gated = s.call('DebugWait', {});
  await until(() => gate.holder !== undefined);
  lookupHeld.release();
  await waited;

  // R is lost and replaced while the gated call still holds it.
  await s.call('LoseSession', { id: 'b' });
  await s.call('ProbeAdt', { id: 'after' });
  const holder = gate.holder as object;
  const endedUnderHolder = isEnded(holder);
  gate.open();
  await gated;
  await until(() => standIn.loggedOff().includes(replacedSession));
  return {
    lostSession,
    lookups: standIn.requests
      .slice(from)
      .filter((r) => isLookup(r) && r.session === replacedSession),
    replacedLogoffs: standIn
      .loggedOff()
      .filter((session) => session === replacedSession).length,
    endedUnderHolder,
  };
}

it("(a) a background-run tool's caller lookup waiting behind a lost session goes out on the replacement", async () => {
  const standIn = await adtStandIn();
  standIn.body(
    isLookup,
    JSON.stringify({ systemID: 'SID', userName: 'TOKEN_USER' }),
  );
  // The caller is asked of SAP.
  const s = await stand({
    settings: { url: standIn.url, client: '100', authType: 'jwt' },
    credential: TokenAuthProvider.fixed('placeholder.token.sig'),
  });
  try {
    // A management tool: its caller is asked of SAP in a turn of the flow
    // (a run tool's caller is its connection's system information, asked
    // before the tool).
    const outcome = await behindALostSession(standIn, s, () =>
      s.call('ListBackgroundRuns', {}),
    );
    const { lostSession, lookups } = outcome;
    const { replacedLogoffs, endedUnderHolder } = outcome;
    expect(lookups.length).toBeGreaterThan(0);
    for (const lookup of lookups) expect(lookup.session).not.toBe(lostSession);
    // The replacement the send held: given back once, logged off once.
    expect(endedUnderHolder).toBe(false);
    expect(replacedLogoffs).toBe(1);
  } finally {
    await s.close();
    await standIn.close();
  }
});

it("(b) a debugger start's request-user lookup waiting behind a lost session goes out on the replacement", async () => {
  const standIn = await adtStandIn();
  standIn.body(
    isLookup,
    JSON.stringify({ systemID: 'SID', userName: 'DEBUG_USER' }),
  );
  const s = await stand({
    settings: {
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'DEBUG_USER',
    },
    credential: new BasicAuthProvider('DEBUG_USER', 'debug-password'),
  });
  try {
    const outcome = await behindALostSession(standIn, s, () =>
      s.call('DebugStartListener', {}),
    );
    const { lostSession, lookups } = outcome;
    const { replacedLogoffs, endedUnderHolder } = outcome;
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.session).not.toBe(lostSession);
    expect(endedUnderHolder).toBe(false);
    expect(replacedLogoffs).toBe(1);
  } finally {
    await s.close();
    await standIn.close();
  }
});
