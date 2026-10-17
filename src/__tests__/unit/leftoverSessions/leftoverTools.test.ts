/**
 * The two leftover-session tools: list and log off
 * the SAP sessions a killed process left, through an MCP client, against
 * the ADT stand-in. Each tool answers only for the caller's own sessions —
 * those of the destination the instance serves; another destination's file
 * and an unknown handle get the same answer — and never for a live
 * process's. Logoff sends the ICF logoff with the session's cookies and no
 * `Authorization`, then deletes the file. (The resume is a stdio start's:
 * `startBirth.test.ts`.)
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { LEFTOVER_SESSION_NOT_AVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import { isLogoff, PROBE_PATH } from '../../helpers/adtStandIn';
import {
  DESTINATION,
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
          name: DESTINATION,
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

  it("hides a live process's file and another destination's", async () => {
    stand = await leftoverStand();
    stand.alive.add(333);
    await stand.leftover({ pid: 333 });
    await stand.leftover({ destination: 'OTHER_DEST' });
    const mine = await stand.leftover({ role: 'debugger' });
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string; role: string }>;
    expect(listed.map((s) => s.handle)).toEqual([mine.handle]);
    expect(listed[0]?.role).toBe('debugger');
  });

  it('matches on the destination, not on the user: who calls is the destination the instance serves', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover({ user: 'OTHER_USER' });
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string; user: string }>;
    expect(listed).toMatchObject([{ handle, user: 'OTHER_USER' }]);
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

  it('sends exactly one request — the logoff: no discovery, no CSRF fetch, no credential, no prepare()', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    const prepare = jest.spyOn(BasicAuthProvider.prototype, 'prepare');
    const from = stand.standIn.requests.length;
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    expect(json(answer.text)).toEqual({ handle, state: 'logged_off' });
    await until(() => stand.standIn.logoffs() === 1);
    const sent = stand.standIn.requests.slice(from);
    expect(sent).toHaveLength(1);
    expect(isLogoff(sent[0]?.url ?? '')).toBe(true);
    expect(sent[0]?.authorization).toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
    expect(stand.files()).toEqual([]);
  });

  it('a session SAP already ended gets the logoff too; its answer is not read, and the file is deleted', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    expect(json(answer.text)).toEqual({ handle, state: 'logged_off' });
    expect(stand.files()).toEqual([]);
  });
});

describe('a handle that is not the caller’s', () => {
  it.each(['LogoffLeftoverSession'])(
    '%s answers an unknown, a foreign and a live one the same, sending nothing',
    async (tool) => {
      stand = await leftoverStand();
      const foreign = await stand.leftover({ destination: 'OTHER_DEST' });
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
