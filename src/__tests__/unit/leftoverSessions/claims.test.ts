/**
 * Two live processes on one leftover file (owner's decision on C21): before
 * a resume or a logoff, a process claims the file by renaming it to a name
 * carrying itself; of two claims, one wins and the other finds nothing — it
 * answers "not available". A file claimed by a process that then died is
 * available again, as any dead process's file.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LEFTOVER_SESSION_NOT_AVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import {
  LeftoverSessions,
  type SessionIdentity,
} from '../../../lib/leftoverSessions/LeftoverSessions';
import { fakeProbe } from '../../helpers/leftoverSession';
import {
  DESTINATION,
  json,
  type LeftoverStand,
  leftoverStand,
} from './harness';

jest.setTimeout(30_000);

const HANDLE = '0123456789abcdef0123456789abcdef';
const IDENTITY: SessionIdentity = {
  destination: 'PLACEHOLDER_DEST',
  url: 'http://placeholder.invalid',
  client: '100',
  system: 'onprem',
  wire: 'http',
  user: 'PLACEHOLDER_USER',
};

/** A file a dead process (pid 111) left, written as the owner writes it. */
function leftover(dir: string, handle = HANDLE): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, handle),
    JSON.stringify({
      format: 2,
      pid: 111,
      start: 'start-111',
      role: 'built',
      destination: {
        name: IDENTITY.destination,
        url: IDENTITY.url,
        client: IDENTITY.client,
        system: IDENTITY.system,
        wire: 'http',
      },
      user: IDENTITY.user,
      cookies: 'SAP_SESSIONID_X01_100=placeholder',
      written_at: '2026-10-13T00:00:00.000Z',
    }),
    { mode: 0o600 },
  );
}

describe('the owner', () => {
  let dir: string;
  const alive = new Set<number>([222, 333]);
  const owner = (pid: number) =>
    new LeftoverSessions({
      directory: dir,
      probe: fakeProbe(pid, alive),
      report: () => {},
    });

  beforeEach(() => {
    dir = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-claims-')),
      'runtime',
    );
    leftover(dir);
  });
  afterEach(() =>
    fs.rmSync(path.dirname(dir), { recursive: true, force: true }),
  );

  it('one of two live processes wins the claim; the other gets nothing', () => {
    const a = owner(222);
    const b = owner(333);
    const won = a.claim(HANDLE, IDENTITY);
    expect(won).toBeDefined();
    expect(b.claim(HANDLE, IDENTITY)).toBeUndefined();
    expect(b.list(IDENTITY)).toEqual([]);
    // The claimed file carries its claimer.
    expect(fs.readdirSync(dir)).toEqual([won?.file]);
    expect(won?.file.startsWith(`${HANDLE}.claimed.222.`)).toBe(true);
  });

  it('released, the file is a leftover again, and the other may claim it', () => {
    const a = owner(222);
    const b = owner(333);
    const won = a.claim(HANDLE, IDENTITY);
    if (!won) throw new Error('not claimed');
    a.release(won);
    expect(fs.readdirSync(dir)).toEqual([HANDLE]);
    expect(b.claim(HANDLE, IDENTITY)).toBeDefined();
  });

  it('a file whose claimer died is listed and claimable again', () => {
    alive.add(555);
    const died = owner(555);
    expect(died.claim(HANDLE, IDENTITY)).toBeDefined();
    const a = owner(222);
    expect(a.list(IDENTITY)).toEqual([]);
    alive.delete(555);
    expect(a.list(IDENTITY).map((s) => s.handle)).toEqual([HANDLE]);
    const taken = a.claim(HANDLE, IDENTITY);
    expect(taken?.file.startsWith(`${HANDLE}.claimed.222.`)).toBe(true);
    if (taken) a.forget(taken);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('through the tools', () => {
  let stand: LeftoverStand;

  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(async () => {
    await stand?.close();
    jest.restoreAllMocks();
  });

  it.each(['ResumeLeftoverSession', 'LogoffLeftoverSession'])(
    '%s: a file another live process claimed is not available, and nothing is sent',
    async (tool) => {
      stand = await leftoverStand();
      const { handle } = await stand.leftover();
      stand.alive.add(333);
      const other = new LeftoverSessions({
        directory: stand.dir,
        probe: fakeProbe(333, stand.alive),
        report: () => {},
      });
      const identity = {
        destination: DESTINATION,
        url: stand.standIn.url,
        client: '100',
        system: 'onprem' as const,
        wire: 'http' as const,
        user: 'LEFT_USER',
      };
      expect(other.claim(handle, identity)).toBeDefined();
      const from = stand.standIn.requests.length;
      const answer = await stand.call(tool, { handle });
      expect(answer.isError).toBe(true);
      expect(json(answer.text).message).toBe(
        LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
      );
      expect(stand.standIn.requests.length).toBe(from);
      // The other process dies with its claim: the session is the user's again.
      stand.alive.delete(333);
      const off = await stand.call('LogoffLeftoverSession', { handle });
      expect(json(off.text)).toEqual({ handle, state: 'logged_off' });
      expect(stand.files()).toEqual([]);
    },
  );

  it('a failed operation gives the file back under its handle', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 500);
    expect(
      (await stand.call('ResumeLeftoverSession', { handle })).isError,
    ).toBe(true);
    expect(stand.files()).toEqual([handle]);
  });
});
