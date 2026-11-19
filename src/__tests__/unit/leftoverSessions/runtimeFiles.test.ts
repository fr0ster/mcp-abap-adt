/**
 * The runtime files: one per owned HTTP connection
 * holding a session — the instance's own (`built`) and each debugger
 * connection — in a `0700` directory, `0600` each (POSIX; on Windows Node's
 * `chmod` sets only the read-only flag, so the directory's ACL applies and
 * the modes are not checked there); written after
 * `connect()`, rewritten when a request changed the session's cookies, and
 * deleted only once that connection's logoff completed — its
 * `flushGoodbye()` settled, SAP's answer received or its transport failed:
 * the terminal close, a replacement, the orderly end. A logoff that was
 * written and not completed (the forced close exits without the flush, a
 * crash, a stand-in whose flush rejects) leaves the file, and the next
 * process lists it; one that was not written leaves it too. RFC keeps none.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { liveDebugPorts } from '../../../lib/debugger/ports';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LeftoverSessions,
  sessionIdentity,
} from '../../../lib/leftoverSessions/LeftoverSessions';
import {
  endConnection,
  forceClose,
  logoffsAnswered,
  own,
} from '../../../lib/ownedConnections';
import { isLogoff, PROBE_PATH } from '../../helpers/adtStandIn';
import { assertMatchObject } from '../../helpers/assertions';
import {
  DESTINATION,
  fakeProbe,
  type LeftoverStand,
  leftoverStand,
  OUR_PID,
  settingsFor,
  until,
} from './harness';

let stand: LeftoverStand | undefined;

beforeEach(() => {
  mock.method(process.stderr, 'write', () => true);
});

/** Held logoff answers, let go before the close (which awaits them). */
const heldAnswers: Array<() => void> = [];

afterEach(async () => {
  for (const release of heldAnswers.splice(0)) release();
  await stand?.close();
  stand = undefined;
  mock.restoreAll();
});

const mode = (file: string) => fs.statSync(file).mode & 0o777;

// POSIX modes exist only off Windows, where Node's `chmod` sets the read-only
// flag alone; there the directory's ACL is what protects the files.
const onPosix = process.platform !== 'win32';
const posixIt = onPosix ? it : it.skip;

it('the instance’s connection: written after connect, 0600 in a 0700 directory; it carries the destination, where it points, the stated user, the system information (asked on-premise too) and the cookies — nothing else', async () => {
  stand = await leftoverStand();
  assert.deepStrictEqual(stand.files(), []);
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  assert.match(handle, /^[0-9a-f]{32}$/);
  if (onPosix) {
    assert.equal(mode(stand.dir), 0o700);
    assert.equal(mode(path.join(stand.dir, handle ?? '')), 0o600);
  }
  const written = stand.file(handle ?? '');
  // The two asymmetric fields checked alone, then the equality over the rest.
  const cookies = written?.cookies;
  assert.ok(
    typeof cookies === 'string' &&
      cookies.includes('SAP_SESSIONID_X01_100=session-1'),
  );
  assert.equal(typeof written?.written_at, 'string');
  assert.deepStrictEqual(written, {
    format: 3,
    pid: OUR_PID,
    start: `start-${OUR_PID}`,
    role: 'built',
    destination: {
      name: DESTINATION,
      url: stand.standIn.url,
      client: '100',
      system: 'onprem',
      wire: 'http',
    },
    user: 'LEFT_USER',
    system: { responsible: 'STAND_IN_USER', master_system: 'STD' },
    cookies,
    written_at: written?.written_at,
  });
});

posixIt(
  'POSIX only: a directory that exists with wider rights is narrowed to 0700',
  async () => {
    stand = await leftoverStand();
    fs.mkdirSync(stand.dir, { mode: 0o755 });
    fs.chmodSync(stand.dir, 0o755);
    await stand.call('ProbeAdt', { id: 'first' });
    assert.equal(mode(stand.dir), 0o700);
  },
);

it('rewritten when a request changed the cookies (a stateful context)', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  const before = stand.file(handle ?? '').cookies;
  assert.ok(typeof before === 'string' && !before.includes('sap-contextid'));
  stand.standIn.body((r) => r.url === `${PROBE_PATH}ctx`, '', {
    'set-cookie': 'sap-contextid=context-1; path=/',
  });
  await stand.call('ProbeAdt', { id: 'ctx' });
  assert.deepStrictEqual(stand.files(), [handle]);
  const after = stand.file(handle ?? '').cookies;
  assert.ok(
    typeof after === 'string' && after.includes('sap-contextid=context-1'),
  );
});

it('deleted once the logoff completed: the terminal close', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  assert.equal(stand.files().length, 1);
  await stand.server.terminalClose();
  assert.deepStrictEqual(stand.files(), []);
  await until(() => stand?.standIn.logoffs() === 1);
});

it('kept while the logoff is written and not answered; deleted once its flush settled', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  const held = stand.standIn.hold((r) => isLogoff(r.url));
  heldAnswers.push(held.release);
  const connection = (stand.server as unknown as { built?: { ready?: object } })
    .built?.ready;
  if (connection === undefined) throw new Error('no built connection');
  // Resolves once the logoff is written; SAP has not answered it.
  await endConnection(connection);
  await held.arrived;
  assert.deepStrictEqual(stand.files(), [handle]);
  held.release();
  await logoffsAnswered();
  assert.deepStrictEqual(stand.files(), []);
});

it('kept by the forced close, which exits after the logoff’s write without its answer: the next process lists it', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  const held = stand.standIn.hold((r) => isLogoff(r.url));
  heldAnswers.push(held.release);
  await forceClose();
  await held.arrived;
  assert.deepStrictEqual(stand.files(), [handle]);
  // The next start of the same destination: this process is gone.
  const next = new LeftoverSessions({
    directory: stand.dir,
    probe: fakeProbe(OUR_PID + 1, new Set()),
    report: () => {},
  });
  const identity = sessionIdentity(
    DESTINATION,
    settingsFor(stand.standIn.url, 'LEFT_USER'),
  );
  if (!identity) throw new Error('no identity');
  assert.deepStrictEqual(
    next.list(identity).map((s) => s.handle),
    [handle],
  );
  held.release();
  await logoffsAnswered();
});

it('kept when the flush did not complete (a stand-in whose flush rejects)', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  const connection = (stand.server as unknown as { built?: { ready?: object } })
    .built?.ready as { flushGoodbye(): Promise<void> } | undefined;
  if (connection === undefined) throw new Error('no built connection');
  connection.flushGoodbye = async () => {
    throw new Error('not answered');
  };
  await stand.server.terminalClose();
  assert.deepStrictEqual(stand.files(), [handle]);
});

it('kept when the logoff could not be written', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  // The instance's connection, failing its disconnect.
  const connection = (
    stand.server as unknown as { built?: { ready?: IAbapConnection } }
  ).built?.ready as unknown as { disconnect(): Promise<void> };
  connection.disconnect = async () => {
    throw new Error('not written');
  };
  await stand.server.terminalClose();
  assert.equal(stand.files().length, 1);
});

describe('a debugger connection', () => {
  it('is kept with role debugger, and deleted once its logoff completed', async () => {
    stand = await leftoverStand();
    const dir = stand.dir;
    const owner = new LeftoverSessions({
      directory: dir,
      probe: fakeProbe(OUR_PID, new Set()),
      report: () => {},
    });
    const settings = settingsFor(stand.standIn.url, 'LEFT_USER');
    const origin = createAbapConnection(
      settings,
      new BasicAuthProvider('LEFT_USER', 'left-password'),
    );
    await (origin as unknown as { connect(): Promise<void> }).connect();
    own(origin, { role: 'built' });
    const identity = sessionIdentity(DESTINATION, settings);
    if (!identity) throw new Error('no identity');
    owner.track(origin, 'built', identity);
    const context = {
      connection: origin,
      sessionFiles: owner,
      logger: { info() {}, debug() {}, warn() {}, error() {} },
    } as unknown as HandlerContext;
    const debug = await liveDebugPorts().openConnection(context);
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 2);
    const roles = files.map(
      (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).role,
    );
    assert.deepStrictEqual(roles.sort(), ['built', 'debugger']);
    await endConnection(debug);
    await logoffsAnswered();
    assert.deepStrictEqual(
      fs
        .readdirSync(dir)
        .map(
          (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).role,
        ),
      ['built'],
    );
    await endConnection(origin);
    await logoffsAnswered();
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });
});

describe('the owner, without a server', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-owner-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps no identity over RFC; a token credential’s states no user', () => {
    assert.equal(
      sessionIdentity('PLACEHOLDER_DEST', {
        client: '100',
        language: 'EN',
        ashost: 'placeholder.invalid',
        sysnr: '00',
        authType: 'basic',
        username: 'PLACEHOLDER_USER',
        connectionType: 'rfc',
      }),
      undefined,
    );
    assertMatchObject(
      sessionIdentity('PLACEHOLDER_DEST', {
        url: 'http://placeholder.invalid',
        authType: 'jwt',
      }),
      { destination: 'PLACEHOLDER_DEST', user: null },
    );
    assertMatchObject(
      sessionIdentity(
        'PLACEHOLDER_DEST',
        { url: 'http://placeholder.invalid/', authType: 'jwt' },
        'placeholder_login',
      ),
      {
        url: 'http://placeholder.invalid',
        user: 'PLACEHOLDER_LOGIN',
      },
    );
  });

  for (const [fileFormat, named] of [
    [1, {}],
    // Format 2 named the destination but carried no system information.
    [2, { name: 'PLACEHOLDER_DEST' }],
  ] satisfies [number, { name?: string }][]) {
    it(
      format(
        'reads no file of another format: a format-%i file is never listed or claimed',
        fileFormat,
      ),
      () => {
        const identity = sessionIdentity('PLACEHOLDER_DEST', {
          url: 'http://placeholder.invalid',
          client: '100',
          authType: 'basic',
          username: 'PLACEHOLDER_USER',
        });
        if (!identity) throw new Error('no identity');
        const handle = '0123456789abcdef0123456789abcdef';
        fs.writeFileSync(
          path.join(dir, handle),
          JSON.stringify({
            format: fileFormat,
            pid: 111,
            start: 'start-111',
            role: 'built',
            destination: {
              ...named,
              url: identity.url,
              client: identity.client,
              system: identity.system,
              wire: 'http',
            },
            user: 'PLACEHOLDER_USER',
            cookies: 'SAP_SESSIONID_X01_100=placeholder',
            written_at: '2026-10-13T00:00:00.000Z',
          }),
        );
        const owner = new LeftoverSessions({
          directory: dir,
          probe: fakeProbe(OUR_PID, new Set()),
        });
        assert.deepStrictEqual(owner.list(identity), []);
        assert.equal(owner.claim(handle, identity), undefined);
        assert.deepStrictEqual(fs.readdirSync(dir), [handle]);
      },
    );
  }

  it('writes nothing for a connection holding no session (an RFC wire answers null)', () => {
    const owner = new LeftoverSessions({
      directory: dir,
      probe: fakeProbe(OUR_PID, new Set()),
    });
    const rfcLike = { sessionCookies: () => null, disconnect: async () => {} };
    owner.track(rfcLike, 'built', {
      destination: 'PLACEHOLDER_DEST',
      url: 'http://placeholder.invalid',
      client: '',
      system: 'onprem',
      wire: 'http',
      user: 'PLACEHOLDER_USER',
    });
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });
});
