/**
 * A resume is how the instance's connection is born: instead of a logon,
 * the connection is built on a leftover session's cookies. So it is possible
 * only while the instance has no connection yet, and never replaces one —
 * once the instance has one, the resume is refused in fixed words, nothing
 * is claimed and nothing is sent. Listing and resuming ask SAP nothing:
 * whose a file is is read from the file and the destination alone, also for
 * a token credential, which states no user.
 *
 * Against the stand-in, whose request log shows every request SAP got.
 */

import {
  LEFTOVER_SESSION_CONNECTOR_EXISTS_WORDS,
  LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
} from '../../../lib/auth/serverRefusal';
import { PROBE_PATH } from '../../helpers/adtStandIn';
import { json, type LeftoverStand, leftoverStand } from './harness';

jest.setTimeout(30_000);

let stand: LeftoverStand;
let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  jest.restoreAllMocks();
});

const sessionOf = (id: string) =>
  stand.standIn.requests.find((r) => r.url === `${PROBE_PATH}${id}`)?.session;

it('a token caller lists and resumes as its first act: SAP gets nothing before the resume’s own connect, and the next tool runs in the resumed session', async () => {
  // A token's session is an ABAP Cloud one: the leftover's file names the
  // same system.
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  stand = await leftoverStand({ token: { tokenUser: 'LEFT_USER' } });
  const { handle, session } = await stand.leftover();
  const from = stand.standIn.requests.length;

  const listed = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(listed.map((s) => s.handle)).toEqual([handle]);
  // The list asked SAP nothing: no logon, no `systeminformation`.
  expect(stand.standIn.requests.length).toBe(from);

  const resumed = await stand.call('ResumeLeftoverSession', { handle });
  expect(json(resumed.text)).toEqual({ handle, state: 'resumed' });
  // Everything SAP got from here on is in the leftover session: no logon
  // came first, and none came at all. The first is the resume's own
  // request, without the credential.
  const sent = stand.standIn.requests.slice(from);
  expect(sent.length).toBeGreaterThan(0);
  expect(sent[0]?.authorization).toBeUndefined();
  for (const r of sent) expect(r.session).toBe(session);

  await stand.call('ProbeAdt', { id: 'after' });
  expect(sessionOf('after')).toBe(session);
});

it('a basic caller resumes as its first act: no logon, and the next tool runs in the resumed session', async () => {
  stand = await leftoverStand();
  const { handle, session } = await stand.leftover();
  const from = stand.standIn.requests.length;
  expect(json((await stand.call('ListLeftoverSessions')).text)).toMatchObject({
    sessions: [{ handle }],
  });
  expect(stand.standIn.requests.length).toBe(from);
  expect(
    json((await stand.call('ResumeLeftoverSession', { handle })).text),
  ).toEqual({ handle, state: 'resumed' });
  for (const r of stand.standIn.requests.slice(from)) {
    expect(r.session).toBe(session);
  }
  await stand.call('ProbeAdt', { id: 'after' });
  expect(sessionOf('after')).toBe(session);
  expect(stand.standIn.logoffs()).toBe(0);
});

it('once a tool call gave the instance its connection, a resume is refused in fixed words: nothing claimed, nothing sent, nothing replaced', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const own = sessionOf('first');
  const { handle, session } = await stand.leftover();
  const from = stand.standIn.requests.length;

  const answer = await stand.call('ResumeLeftoverSession', { handle });
  expect(answer.isError).toBe(true);
  expect(json(answer.text)).toMatchObject({
    error: 'leftover_session_connector_exists',
    message: LEFTOVER_SESSION_CONNECTOR_EXISTS_WORDS,
  });
  expect(stand.standIn.requests.length).toBe(from);
  // Still a leftover, under its handle, listed and claimable.
  expect(stand.files()).toContain(handle);
  const listed = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(listed.map((s) => s.handle)).toEqual([handle]);

  // The instance keeps its own connection: nothing was logged off.
  await stand.call('ProbeAdt', { id: 'second' });
  expect(sessionOf('second')).toBe(own);
  expect(sessionOf('second')).not.toBe(session);
  expect(stand.standIn.logoffs()).toBe(0);
});

it('the refusal comes before the handle is read: an unknown handle on an instance with a connection gets it too', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const answer = await stand.call('ResumeLeftoverSession', {
    handle: '0123456789abcdef0123456789abcdef',
  });
  expect(json(answer.text).message).toBe(
    LEFTOVER_SESSION_CONNECTOR_EXISTS_WORDS,
  );
  expect(json(answer.text).message).not.toBe(
    LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
  );
});

it('after a resume the instance has its connection: a second resume is refused', async () => {
  stand = await leftoverStand();
  const first = await stand.leftover();
  const second = await stand.leftover();
  expect(
    json(
      (await stand.call('ResumeLeftoverSession', { handle: first.handle }))
        .text,
    ),
  ).toMatchObject({ state: 'resumed' });
  const answer = await stand.call('ResumeLeftoverSession', {
    handle: second.handle,
  });
  expect(json(answer.text).error).toBe('leftover_session_connector_exists');
  expect(stand.files()).toContain(second.handle);
  expect(stand.standIn.loggedOff()).not.toContain(first.session);
});

it('a session SAP says is gone gives the instance no connection: the next tool logs on', async () => {
  stand = await leftoverStand();
  const { handle, session } = await stand.leftover();
  stand.standIn.answer((r) => r.session === session, 401);
  const answer = await stand.call('ResumeLeftoverSession', { handle });
  expect(json(answer.text)).toMatchObject({ handle, state: 'gone' });
  expect(stand.files()).toEqual([]);
  expect((await stand.call('ProbeAdt', { id: 'fresh' })).isError).toBe(false);
  expect(sessionOf('fresh')).toBeDefined();
  expect(sessionOf('fresh')).not.toBe(session);
});
