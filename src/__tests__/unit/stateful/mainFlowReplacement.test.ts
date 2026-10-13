/**
 * A session lost while calls wait in the main flow (C15 round 6): a queued
 * call took its connection before it waited, so the call ahead can spend it
 * under it. After the flow is entered the connection is checked again; a
 * spent one is given back and the replacement taken, before the tool runs.
 *
 * Against the stand-in, which gives every connection an ABAP session of its
 * own: a running call loses its session while three reads are queued — the
 * reads run on the replacement connection (a new session), and the call
 * that lost the session is not replayed.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { isEnded } from '../../../lib/ownedConnections';
import {
  adtStandIn,
  isLogoff,
  PROBE_PATH,
  probeGroup,
} from '../../helpers/adtStandIn';
import { clientOf, StandServer, silent } from '../backgroundRuns/harness';

jest.setTimeout(30_000);

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const LOSE_PATH = '/sap/bc/adt/probe-lose/';

/**
 * `LoseSession { id }`: sends one request on its connection, then finds its
 * session lost (as SAP's answer would mark it) and fails.
 */
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
    lost = context.connection;
    // SAP lost the session under this call.
    context.connection.isConnected = () => false;
    throw new Error('the session was lost');
  }) as never,
} as unknown as HandlerEntry;

/** The connection whose session `LoseSession` lost. */
let lost: object | undefined;
/** Per queued read: whether the lost connection had ended when it ran. */
const endedWhenRun = new Map<string, boolean>();

/**
 * `ReadAndCheck { id }`: records whether the lost connection has already
 * ended — its logoff begun — then sends one read on its own connection.
 */
const readAndCheck: HandlerEntry = {
  toolDefinition: {
    name: 'ReadAndCheck',
    description: 'ReadAndCheck',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  handler: (async (
    context: { connection: { makeAdtRequest(o: object): Promise<unknown> } },
    args: { id: string },
  ) => {
    endedWhenRun.set(args.id, lost !== undefined && isEnded(lost));
    await context.connection.makeAdtRequest({
      url: `${PROBE_PATH}${args.id}`,
      method: 'GET',
      timeout: 10_000,
    });
    return { content: [{ type: 'text', text: args.id }] };
  }) as never,
} as unknown as HandlerEntry;

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

it('a running call loses its session while reads are queued: the reads run on the replacement, the lost call is not replayed', async () => {
  const standIn = await adtStandIn();
  const server = new StandServer({
    name: 'flow-replacement',
    logger: silent,
    systemType: 'onprem',
  });
  server.use({
    settings: {
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'FLOW_USER',
    },
    credential: new BasicAuthProvider('FLOW_USER', 'flow-password'),
  });
  server.register(
    new CompositeHandlersRegistry([probeGroup([loseSession, readAndCheck])]),
  );
  const client = await clientOf(server);
  try {
    await client.call('ProbeAdt', { id: 'warm' });
    const first = standIn.requests.find((r) => r.url === `${PROBE_PATH}warm`);
    const firstSession = first?.session ?? '';
    expect(firstSession).not.toBe('');

    const held = standIn.hold((r) => r.url === `${LOSE_PATH}a`);
    const losing = client.call('LoseSession', { id: 'a' });
    await held.arrived;
    const reads = ['q1', 'q2', 'q3'].map((id) =>
      client.call('ReadAndCheck', { id }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    held.release();

    expect((await losing).isError).toBe(true);
    const answers = await Promise.all(reads);
    for (const answer of answers) expect(answer.isError).toBe(false);

    const readSessions = ['q1', 'q2', 'q3'].map(
      (id) =>
        standIn.requests.find((r) => r.url === `${PROBE_PATH}${id}`)?.session,
    );
    // On the replacement: one new session, not the lost one.
    expect(new Set(readSessions).size).toBe(1);
    expect(readSessions[0]).toBeDefined();
    expect(readSessions[0]).not.toBe(firstSession);
    // The spent connection is given back by every call that held it, each
    // once: it ends with its logoff only when the last lets go — q3, which
    // still held it while q2 ran — and it is logged off exactly once.
    await until(() => standIn.loggedOff().includes(firstSession));
    expect(
      standIn.loggedOff().filter((session) => session === firstSession),
    ).toHaveLength(1);
    const logoff = standIn.requests.findIndex(
      (r) => isLogoff(r.url) && r.session === firstSession,
    );
    const q2 = standIn.requests.findIndex((r) => r.url === `${PROBE_PATH}q2`);
    expect(q2).toBeGreaterThanOrEqual(0);
    expect(logoff).toBeGreaterThan(q2);
    // Not ended while a queued call still held it: q1 and q2 ran while q3
    // held the spent reference (a reference given back twice ends it early).
    expect(endedWhenRun.get('q1')).toBe(false);
    expect(endedWhenRun.get('q2')).toBe(false);
    // The call that lost the session ran once.
    expect(
      standIn.requests.filter((r) => r.url === `${LOSE_PATH}a`),
    ).toHaveLength(1);
  } finally {
    await client.close();
    await server.terminalClose();
    await standIn.close();
  }
});
