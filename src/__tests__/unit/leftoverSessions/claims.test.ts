/**
 * Two live processes on one leftover file (the owner's decision): before
 * a resume (at a stdio start) or a logoff, a process claims the file by renaming it to a name
 * carrying itself; of two claims, one wins and the other finds nothing — it
 * answers "not available". A file claimed by a process that then died is
 * available again, as any dead process's file.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { LEFTOVER_SESSION_NOT_AVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import {
  LeftoverSessions,
  type SessionIdentity,
} from '../../../lib/leftoverSessions/LeftoverSessions';
import { rejectionOf } from '../../helpers/assertions';
import { fakeProbe } from '../../helpers/leftoverSession';
import {
  DESTINATION,
  json,
  type LeftoverStand,
  leftoverStand,
} from './harness';

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
      format: 3,
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
      system: null,
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
    assert.notEqual(won, undefined);
    assert.equal(b.claim(HANDLE, IDENTITY), undefined);
    assert.deepStrictEqual(b.list(IDENTITY), []);
    // The claimed file carries its claimer.
    assert.deepStrictEqual(fs.readdirSync(dir), [won?.file]);
    assert.equal(won?.file.startsWith(`${HANDLE}.claimed.222.`), true);
  });

  it('released, the file is a leftover again, and the other may claim it', () => {
    const a = owner(222);
    const b = owner(333);
    const won = a.claim(HANDLE, IDENTITY);
    if (!won) throw new Error('not claimed');
    a.release(won);
    assert.deepStrictEqual(fs.readdirSync(dir), [HANDLE]);
    assert.notEqual(b.claim(HANDLE, IDENTITY), undefined);
  });

  it('a file whose claimer died is listed and claimable again', () => {
    alive.add(555);
    const died = owner(555);
    assert.notEqual(died.claim(HANDLE, IDENTITY), undefined);
    const a = owner(222);
    assert.deepStrictEqual(a.list(IDENTITY), []);
    alive.delete(555);
    assert.deepStrictEqual(
      a.list(IDENTITY).map((s) => s.handle),
      [HANDLE],
    );
    const taken = a.claim(HANDLE, IDENTITY);
    assert.equal(taken?.file.startsWith(`${HANDLE}.claimed.222.`), true);
    if (taken) a.forget(taken);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });

  describe('adopt', () => {
    /** A connection as the owner reads it: its cookies, and a request. */
    const connection = (cookies: string | null) => {
      const held = { cookies };
      return {
        held,
        sessionCookies: () => held.cookies,
        makeAdtRequest: async (): Promise<IAdtWireResponse> => ({
          status: 200,
          statusText: 'OK',
          headers: {},
          data: '',
        }),
      };
    };

    it('removes the claimed file once the file under the handle is written', () => {
      const a = owner(222);
      const claimed = a.claim(HANDLE, IDENTITY);
      if (!claimed) throw new Error('not claimed');
      a.adopt(claimed, connection('SAP_SESSIONID_X01_100=fresh'), IDENTITY);
      assert.deepStrictEqual(fs.readdirSync(dir), [HANDLE]);
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, HANDLE), 'utf8')).pid,
        222,
      );
    });

    it('keeps the claimed file while the connection holds no cookie, and removes it when the first write lands', async () => {
      const a = owner(222);
      const claimed = a.claim(HANDLE, IDENTITY);
      if (!claimed) throw new Error('not claimed');
      const adopted = connection(null);
      a.adopt(claimed, adopted, IDENTITY);
      assert.deepStrictEqual(fs.readdirSync(dir), [claimed.file]);
      adopted.held.cookies = 'SAP_SESSIONID_X01_100=fresh';
      await adopted.makeAdtRequest();
      assert.deepStrictEqual(fs.readdirSync(dir), [HANDLE]);
    });

    it('keeps the claimed file when the write failed', () => {
      const a = owner(222);
      const claimed = a.claim(HANDLE, IDENTITY);
      if (!claimed) throw new Error('not claimed');
      // A directory where the partial file goes: the write cannot succeed.
      fs.mkdirSync(path.join(dir, `${HANDLE}.partial`));
      a.adopt(claimed, connection('SAP_SESSIONID_X01_100=fresh'), IDENTITY);
      assert.deepStrictEqual(
        fs.readdirSync(dir).sort(),
        [claimed.file, `${HANDLE}.partial`].sort(),
      );
    });
  });
});

describe('through the tools', () => {
  let stand: LeftoverStand;

  beforeEach(() => {
    mock.method(process.stderr, 'write', () => true);
  });
  afterEach(async () => {
    await stand?.close();
    mock.restoreAll();
  });

  for (const tool of ['LogoffLeftoverSession']) {
    it(
      format(
        '%s: a file another live process claimed is not available, and nothing is sent',
        tool,
      ),
      async () => {
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
        assert.notEqual(other.claim(handle, identity), undefined);
        const from = stand.standIn.requests.length;
        const answer = await stand.call(tool, { handle });
        assert.equal(answer.isError, true);
        assert.equal(
          json(answer.text).message,
          LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
        );
        assert.equal(stand.standIn.requests.length, from);
        // The other process dies with its claim: the session is the user's again.
        stand.alive.delete(333);
        const off = await stand.call('LogoffLeftoverSession', { handle });
        assert.deepStrictEqual(json(off.text), { handle, state: 'logged_off' });
        assert.deepStrictEqual(stand.files(), []);
      },
    );
  }

  it('a start whose resume failed gives the file back under its handle', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 500);
    assert.notEqual(await rejectionOf(stand.start()), undefined);
    assert.deepStrictEqual(stand.files(), [handle]);
  });

  it('a start claims nothing another live process claimed: a normal logon', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    stand.alive.add(333);
    const other = new LeftoverSessions({
      directory: stand.dir,
      probe: fakeProbe(333, stand.alive),
      report: () => {},
    });
    const claimed = other.claim(handle, {
      destination: DESTINATION,
      url: stand.standIn.url,
      client: '100',
      system: 'onprem',
      wire: 'http',
      user: 'LEFT_USER',
    });
    assert.notEqual(claimed, undefined);
    assert.deepStrictEqual(await stand.start(), { session: 'logged_on' });
    const files: (string | undefined)[] = stand.files();
    assert.ok(files.includes(claimed?.file));
  });
});
