/**
 * The three leftover-session tools (session-resume spec): list, resume and
 * log off the SAP sessions a killed process left, through an MCP client,
 * against the ADT stand-in. Each tool answers only for the caller's own
 * sessions — someone else's file and an unknown handle get the same answer
 * — and never for a live process's. Resume builds the instance's connection
 * on the session (no logon: no credential, no new session at the stand-in);
 * SAP's "gone" deletes the file. Logoff sends the ICF logoff with the
 * session's cookies and no `Authorization`, then deletes the file.
 */

import { LEFTOVER_SESSION_NOT_AVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import { isLogoff, PROBE_PATH } from '../../helpers/adtStandIn';
import {
  json,
  type LeftoverStand,
  leftoverStand,
  OUR_PID,
  until,
} from './harness';

jest.setTimeout(30_000);

let stand: LeftoverStand;

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  jest.restoreAllMocks();
});

describe('ListLeftoverSessions', () => {
  it("lists the caller's sessions of dead processes, without a cookie", async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    const answer = await stand.call('ListLeftoverSessions');
    expect(answer.isError).toBe(false);
    const listed = json(answer.text).sessions as Array<Record<string, unknown>>;
    expect(listed).toEqual([
      {
        handle,
        role: 'built',
        destination: {
          url: stand.standIn.url,
          client: '100',
          system: 'onprem',
        },
        user: 'LEFT_USER',
        written_at: expect.any(String),
      },
    ]);
    expect(answer.text).not.toContain('SAP_SESSIONID');
    expect(answer.text).not.toContain('session-');
  });

  it("hides a live process's file and someone else's", async () => {
    stand = await leftoverStand();
    stand.alive.add(333);
    await stand.leftover({ pid: 333 });
    await stand.leftover({ user: 'OTHER_USER' });
    const mine = await stand.leftover({ role: 'debugger' });
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string; role: string }>;
    expect(listed.map((s) => s.handle)).toEqual([mine.handle]);
    expect(listed[0]?.role).toBe('debugger');
  });

  it('lists none of its own process’s files: they belong to a running process', async () => {
    stand = await leftoverStand();
    // This instance's own connection: its file is this (live) process's.
    await stand.call('ProbeAdt', { id: 'own' });
    expect(stand.files()).toHaveLength(1);
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as unknown[];
    expect(listed).toEqual([]);
  });

  it('is not available on an instance whose host gave no owner', async () => {
    stand = await leftoverStand({ noOwner: true });
    await stand.leftover();
    const answer = await stand.call('ListLeftoverSessions');
    expect(answer.isError).toBe(true);
    expect(json(answer.text).error).toBe('leftover_sessions_unavailable');
  });
});

describe('ResumeLeftoverSession', () => {
  it('builds the instance’s connection on the session: no logon, no new session', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    const from = stand.standIn.requests.length;
    const answer = await stand.call('ResumeLeftoverSession', { handle });
    expect(answer.isError).toBe(false);
    expect(json(answer.text)).toEqual({ handle, state: 'resumed' });
    // The resume's own request: in that session, without the credential.
    const resumed = stand.standIn.requests.slice(from);
    expect(resumed.length).toBeGreaterThan(0);
    for (const r of resumed) {
      expect(r.session).toBe(session);
      expect(r.authorization).toBeUndefined();
    }
    // The next call works in that session, on the same connection.
    await stand.call('ProbeAdt', { id: 'after' });
    const probe = stand.standIn.requests.find(
      (r) => r.url === `${PROBE_PATH}after`,
    );
    expect(probe?.session).toBe(session);
    // The file is this process's now, under the same handle.
    expect(stand.files()).toEqual([handle]);
    expect(stand.file(handle)).toMatchObject({ pid: OUR_PID, role: 'built' });
    expect(stand.standIn.logoffs()).toBe(0);
  });

  it('ends the session the instance held before, as a replaced connection', async () => {
    stand = await leftoverStand();
    await stand.call('ProbeAdt', { id: 'before' });
    const held = stand.standIn.requests.find(
      (r) => r.url === `${PROBE_PATH}before`,
    )?.session;
    const { handle, session } = await stand.leftover();
    await stand.call('ResumeLeftoverSession', { handle });
    // Written when the resume answered; the stand-in reads it a moment later.
    await until(() => stand.standIn.logoffs() === 1);
    expect(stand.standIn.loggedOff()).toEqual([held]);
    expect(held).not.toBe(session);
    // Its file went with its logoff; the resumed one stays.
    expect(stand.files()).toEqual([handle]);
  });

  it('answers SAP’s 401 as it is, and deletes the file', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    const answer = await stand.call('ResumeLeftoverSession', { handle });
    expect(answer.isError).toBe(true);
    expect(json(answer.text)).toMatchObject({
      handle,
      state: 'gone',
      sap: { status: 401 },
    });
    expect(stand.files()).toEqual([]);
  });

  it('keeps the file when SAP answers something other than "gone" (a 500)', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 500);
    const answer = await stand.call('ResumeLeftoverSession', { handle });
    expect(answer.isError).toBe(true);
    expect(stand.files()).toEqual([handle]);
  });

  it('refuses a debugger’s session and leaves it', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover({ role: 'debugger' });
    const from = stand.standIn.requests.length;
    const answer = await stand.call('ResumeLeftoverSession', { handle });
    expect(answer.isError).toBe(true);
    expect(json(answer.text).error).toBe('leftover_session_not_resumable');
    expect(stand.standIn.requests.length).toBe(from);
    expect(stand.files()).toEqual([handle]);
  });
});

describe('LogoffLeftoverSession', () => {
  it('sends the ICF logoff with the session’s cookies and no credential, then deletes the file', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover({ role: 'debugger' });
    const from = stand.standIn.requests.length;
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    expect(answer.isError).toBe(false);
    expect(json(answer.text)).toEqual({ handle, state: 'logged_off' });
    // Written when the tool answered; the stand-in reads it a moment later.
    await until(() => stand.standIn.logoffs() === 1);
    const sent = stand.standIn.requests.slice(from);
    const logoff = sent.find((r) => isLogoff(r.url));
    expect(logoff?.session).toBe(session);
    expect(logoff?.cookie).toContain(`=${session}`);
    for (const r of sent) expect(r.authorization).toBeUndefined();
    expect(stand.files()).toEqual([]);
  });

  it('a session SAP already ended: reported, nothing logged off, the file deleted', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    expect(answer.isError).toBe(false);
    expect(json(answer.text)).toMatchObject({
      handle,
      state: 'already_ended',
      sap: { status: 401 },
    });
    expect(stand.standIn.logoffs()).toBe(0);
    expect(stand.files()).toEqual([]);
  });
});

describe('a handle that is not the caller’s', () => {
  it.each(['ResumeLeftoverSession', 'LogoffLeftoverSession'])(
    '%s answers an unknown, a foreign and a live one the same, sending nothing',
    async (tool) => {
      stand = await leftoverStand();
      const foreign = await stand.leftover({ user: 'OTHER_USER' });
      stand.alive.add(444);
      const live = await stand.leftover({ pid: 444 });
      const from = stand.standIn.requests.length;
      const answers = await Promise.all(
        [
          '0123456789abcdef0123456789abcdef',
          'not-a-handle',
          foreign.handle,
          live.handle,
        ].map((handle) => stand.call(tool, { handle })),
      );
      for (const answer of answers) {
        expect(answer.isError).toBe(true);
        expect(answer.text).toBe(answers[0]?.text);
      }
      expect(json(answers[0]?.text ?? '').message).toBe(
        LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
      );
      expect(stand.standIn.requests.length).toBe(from);
      expect(stand.files()).toEqual(
        [foreign.handle, live.handle].sort((a, b) => a.localeCompare(b)),
      );
    },
  );
});
