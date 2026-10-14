/**
 * A resume takes its turn in the main flow (C15 round 13): it changes the
 * instance's connection, so it waits for the call ahead, and a call queued
 * after it — which took the instance's connection before it waited — runs
 * on the resumed connection, not on the one the resume retired.
 *
 * Against the stand-in: a running probe is held in the instance's session;
 * a resume is issued, then a probe (as an UNLOCK carrying the resumed
 * session's lock handle would be). The resume sends nothing until the
 * running probe settled; the queued probe runs after the resume, in the
 * resumed session; the retired session is logged off once, after the last
 * call that held it let it go.
 */

import { PROBE_PATH } from '../../helpers/adtStandIn';
import { json, type LeftoverStand, leftoverStand, until } from './harness';

jest.setTimeout(30_000);

let stand: LeftoverStand;

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  jest.restoreAllMocks();
});

it('a resume waits for the running call, and a call queued after it runs on the resumed session', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'warm' });
  const own = stand.standIn.requests.find(
    (r) => r.url === `${PROBE_PATH}warm`,
  )?.session;
  expect(own).toBeDefined();
  const { handle, session } = await stand.leftover();
  expect(session).not.toBe(own);

  const held = stand.standIn.hold((r) => r.url === `${PROBE_PATH}running`);
  const running = stand.call('ProbeAdt', { id: 'running' });
  await held.arrived;
  const from = stand.standIn.requests.length;
  const resume = stand.call('ResumeLeftoverSession', { handle });
  // The resume is in the flow before the queued call is issued.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const queued = stand.call('ProbeAdt', { id: 'queued' });
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Waiting for the running call: nothing sent in the leftover session yet,
  // the queued call has not run.
  const meanwhile = stand.standIn.requests.slice(from);
  expect(meanwhile.filter((r) => r.session === session)).toEqual([]);
  expect(meanwhile.some((r) => r.url === `${PROBE_PATH}queued`)).toBe(false);

  held.release();
  expect((await running).isError).toBe(false);
  const resumed = await resume;
  expect(resumed.isError).toBe(false);
  expect(json(resumed.text)).toEqual({ handle, state: 'resumed' });
  expect((await queued).isError).toBe(false);

  const after = stand.standIn.requests.slice(from);
  const firstInResumed = after.findIndex((r) => r.session === session);
  const queuedAt = after.findIndex((r) => r.url === `${PROBE_PATH}queued`);
  expect(firstInResumed).toBeGreaterThanOrEqual(0);
  // After the resume, in the resumed session.
  expect(queuedAt).toBeGreaterThan(firstInResumed);
  expect(after[queuedAt]?.session).toBe(session);

  // The retired session ends with one logoff, once nothing holds it.
  await until(() => stand.standIn.loggedOff().includes(own ?? ''));
  expect(stand.standIn.loggedOff().filter((s) => s === own)).toHaveLength(1);
});

it('a resume whose request is cancelled while it waits in the flow leaves at once and claims nothing', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'warm' });
  const { handle, session } = await stand.leftover();
  const held = stand.standIn.hold((r) => r.url === `${PROBE_PATH}running`);
  const running = stand.call('ProbeAdt', { id: 'running' });
  await held.arrived;
  const inSession = () =>
    stand.standIn.requests.filter((r) => r.session === session).length;
  const sentBefore = inSession();
  const controller = new AbortController();
  const resume = stand.callWith(
    'ResumeLeftoverSession',
    { handle },
    controller.signal,
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort();
  await expect(resume).rejects.toBeDefined();
  held.release();
  expect((await running).isError).toBe(false);
  // Nothing sent in the leftover session; its file is still a leftover.
  expect(inSession()).toBe(sentBefore);
  expect(stand.files()).toContain(handle);
  const listed = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(listed.map((s) => s.handle)).toEqual([handle]);
});

it('a token credential’s resume asks SAP whose session it is from inside its own turn, and resumes', async () => {
  // No user in the request: the resume, holding the flow, asks SAP on the
  // instance's connection — built with its logon, as nothing holds one yet —
  // without queueing behind itself.
  stand = await leftoverStand({ token: { tokenUser: 'LEFT_USER' } });
  // A token's session is an ABAP Cloud one: the leftover's file names the
  // same system.
  const previous = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  try {
    await resumeAsToken(stand);
  } finally {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  }
});

async function resumeAsToken(stand: LeftoverStand): Promise<void> {
  const { handle, session } = await stand.leftover();
  const resume = stand.call('ResumeLeftoverSession', { handle });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    resume.then(() => 'settled' as const),
    new Promise<'blocked'>((resolve) => {
      timer = setTimeout(() => resolve('blocked'), 5_000);
    }),
  ]);
  clearTimeout(timer);
  expect(outcome).toBe('settled');
  expect(json((await resume).text)).toEqual({ handle, state: 'resumed' });
  await stand.call('ProbeAdt', { id: 'after' });
  expect(
    stand.standIn.requests.find((r) => r.url === `${PROBE_PATH}after`)?.session,
  ).toBe(session);
}
