/**
 * A known caller is answered without entering the main flow (C15 round 8,
 * I-R4a). Work outside the flow — a background start, a leftover-session
 * tool — that needs its caller's backend user asks SAP once (through the
 * flow); once known, it answers at once, also while a call holds the flow,
 * and sends no lookup.
 *
 * Against the stand-in, with a token credential (it states no user, so the
 * user is SAP's `systeminformation` answer).
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  adtStandIn,
  PROBE_PATH,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { callerOn } from '../backgroundRuns/harness';
import { type LeftoverStand, leftoverStand } from '../leftoverSessions/harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');

/** `work` settled within `ms`, or not. */
async function settlesWithin<T>(
  work: Promise<T>,
  ms: number,
): Promise<'settled' | 'blocked'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const blocked = new Promise<'blocked'>((resolve) => {
    timer = setTimeout(() => resolve('blocked'), ms);
  });
  const outcome = await Promise.race([
    work.then(() => 'settled' as const),
    blocked,
  ]);
  clearTimeout(timer);
  return outcome;
}

it('a second background start with a token credential answers at once while a call holds the flow, and asks nothing', async () => {
  const standIn = await adtStandIn();
  standIn.body(
    isLookup,
    JSON.stringify({ systemID: 'SID', userName: 'TOKEN_USER' }),
  );
  const caller = await callerOn(standIn, new InMemoryBackgroundRuns(), {
    tokenUser: 'TOKEN_USER',
  });
  // The probe tool beside the run tools: the call that holds the flow.
  (
    caller.server as unknown as {
      register(registry: CompositeHandlersRegistry): void;
    }
  ).register(new CompositeHandlersRegistry([probeGroup()]));
  try {
    const first = await caller.call('RuntimeRunClass', {
      class_name: 'ZCL_FIRST',
      background: true,
    });
    expect(first.isError).toBe(false);
    const lookups = standIn.requests.filter(isLookup).length;
    expect(lookups).toBeGreaterThan(0);

    // A call on the instance's connection, held at the stand-in.
    const held = standIn.hold((r) => r.url === `${PROBE_PATH}holder`);
    const holder = caller.call('ProbeAdt', { id: 'holder' });
    await held.arrived;

    const second = caller.call('RuntimeRunClass', {
      class_name: 'ZCL_SECOND',
      background: true,
    });
    const outcome = await settlesWithin(second, 2_000);
    held.release();
    await holder;
    expect(outcome).toBe('settled');
    expect((await second).isError).toBe(false);
    expect(standIn.requests.filter(isLookup).length).toBe(lookups);
  } finally {
    await caller.close();
    await standIn.close();
  }
});

it('a leftover-session tool with a token credential answers at once while a call holds the flow, and asks nothing', async () => {
  const stand: LeftoverStand = await leftoverStand({
    token: { tokenUser: 'TOKEN_USER' },
  });
  try {
    // The instance's connection, its identity kept by the owner.
    await stand.call('ProbeAdt', { id: 'warm' });
    const lookups = stand.standIn.requests.filter(isLookup).length;

    const held = stand.standIn.hold((r) => r.url === `${PROBE_PATH}holder`);
    const holder = stand.call('ProbeAdt', { id: 'holder' });
    await held.arrived;

    const listed = stand.call('ListLeftoverSessions');
    const outcome = await settlesWithin(listed, 2_000);
    held.release();
    await holder;
    expect(outcome).toBe('settled');
    expect((await listed).isError).toBe(false);
    expect(stand.standIn.requests.filter(isLookup).length).toBe(lookups);
  } finally {
    await stand.close();
  }
});
