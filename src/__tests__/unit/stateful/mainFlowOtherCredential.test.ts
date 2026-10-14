/**
 * A queued call whose connection was retired for another credential keeps it
 * (C15 round 13). Inside the flow a call gives back a connection replaced
 * meanwhile for its own credential (a resume, a lost session's replacement);
 * one retired because another credential's call took the instance (http,
 * sse: a pooled instance reached with another request's headers) is still
 * the call's own session — the one its credential's locks live in.
 *
 * Against the stand-in, which gives every connection an ABAP session of its
 * own: USER_A's call is queued behind a running one; USER_B's call takes the
 * instance meanwhile. A's call runs in A's session, B's in a new one, and
 * A's session ends with one logoff after A's call let it go.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
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

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

it("a call queued for USER_A runs in A's session although USER_B's call took the instance meanwhile", async () => {
  const standIn = await adtStandIn();
  const server = new StandServer({
    name: 'flow-other-credential',
    logger: silent,
    systemType: 'onprem',
  });
  const as = (user: string) => ({
    settings: {
      url: standIn.url,
      client: '100',
      authType: 'basic' as const,
      username: user,
    },
    credential: new BasicAuthProvider(user, `${user}-password`),
  });
  server.use(as('USER_A'));
  server.register(new CompositeHandlersRegistry([probeGroup([])]));
  const client = await clientOf(server);
  const sessionOf = (id: string) =>
    standIn.requests.find((r) => r.url === `${PROBE_PATH}${id}`)?.session;
  try {
    await client.call('ProbeAdt', { id: 'warm' });
    const sessionA = sessionOf('warm') ?? '';
    expect(sessionA).not.toBe('');

    const held = standIn.hold((r) => r.url === `${PROBE_PATH}running`);
    const running = client.call('ProbeAdt', { id: 'running' });
    await held.arrived;
    // A's call takes A's connection, then waits in the flow.
    const queuedA = client.call('ProbeAdt', { id: 'qa' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Another request's credential: A's connection is retired, B's built.
    server.use(as('USER_B'));
    const queuedB = client.call('ProbeAdt', { id: 'qb' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    held.release();

    expect((await running).isError).toBe(false);
    expect((await queuedA).isError).toBe(false);
    expect((await queuedB).isError).toBe(false);
    expect(sessionOf('qa')).toBe(sessionA);
    const sessionB = sessionOf('qb');
    expect(sessionB).toBeDefined();
    expect(sessionB).not.toBe(sessionA);

    await until(() => standIn.loggedOff().includes(sessionA));
    expect(standIn.loggedOff().filter((s) => s === sessionA)).toHaveLength(1);
    const logoff = standIn.requests.findIndex(
      (r) => isLogoff(r.url) && r.session === sessionA,
    );
    const qa = standIn.requests.findIndex((r) => r.url === `${PROBE_PATH}qa`);
    expect(logoff).toBeGreaterThan(qa);
  } finally {
    await client.close();
    await server.terminalClose();
    await standIn.close();
  }
});
