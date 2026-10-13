/**
 * The runtime files (session-resume spec): one per owned HTTP connection
 * holding a session — the instance's own (`built`) and each debugger
 * connection — in a `0700` directory, `0600` each; written after
 * `connect()`, rewritten when a request changed the session's cookies, and
 * deleted once that connection's logoff is written: the terminal close, a
 * replacement, the forced close (the crash path's). A logoff that was not
 * written leaves the file. RFC keeps none.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { liveDebugPorts } from '../../../lib/debugger/ports';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LeftoverSessions,
  sessionIdentity,
} from '../../../lib/leftoverSessions/LeftoverSessions';
import { endConnection, forceClose, own } from '../../../lib/ownedConnections';
import { PROBE_PATH } from '../../helpers/adtStandIn';
import {
  fakeProbe,
  type LeftoverStand,
  leftoverStand,
  OUR_PID,
  settingsFor,
  until,
} from './harness';

jest.setTimeout(30_000);

let stand: LeftoverStand | undefined;

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  stand = undefined;
  jest.restoreAllMocks();
});

const mode = (file: string) => fs.statSync(file).mode & 0o777;

it('the instance’s connection: written after connect, 0600 in a 0700 directory', async () => {
  stand = await leftoverStand();
  expect(stand.files()).toEqual([]);
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  expect(handle).toMatch(/^[0-9a-f]{32}$/);
  expect(mode(stand.dir)).toBe(0o700);
  expect(mode(path.join(stand.dir, handle ?? ''))).toBe(0o600);
  expect(stand.file(handle ?? '')).toEqual({
    format: 1,
    pid: OUR_PID,
    start: `start-${OUR_PID}`,
    role: 'built',
    destination: {
      url: stand.standIn.url,
      client: '100',
      system: 'onprem',
      wire: 'http',
    },
    user: 'LEFT_USER',
    cookies: expect.stringContaining('SAP_SESSIONID_X01_100=session-1'),
    written_at: expect.any(String),
  });
});

it('a directory that exists with wider rights is narrowed to 0700', async () => {
  stand = await leftoverStand();
  fs.mkdirSync(stand.dir, { mode: 0o755 });
  fs.chmodSync(stand.dir, 0o755);
  await stand.call('ProbeAdt', { id: 'first' });
  expect(mode(stand.dir)).toBe(0o700);
});

it('rewritten when a request changed the cookies (a stateful context)', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  const [handle] = stand.files();
  expect(stand.file(handle ?? '').cookies).not.toContain('sap-contextid');
  stand.standIn.body((r) => r.url === `${PROBE_PATH}ctx`, '', {
    'set-cookie': 'sap-contextid=context-1; path=/',
  });
  await stand.call('ProbeAdt', { id: 'ctx' });
  expect(stand.files()).toEqual([handle]);
  expect(stand.file(handle ?? '').cookies).toContain('sap-contextid=context-1');
});

it('deleted once the logoff is written: the terminal close', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  expect(stand.files()).toHaveLength(1);
  await stand.server.terminalClose();
  expect(stand.files()).toEqual([]);
  await until(() => stand?.standIn.logoffs() === 1);
});

it('deleted once the logoff is written: the forced close (the crash path)', async () => {
  stand = await leftoverStand();
  await stand.call('ProbeAdt', { id: 'first' });
  expect(stand.files()).toHaveLength(1);
  await forceClose();
  expect(stand.files()).toEqual([]);
  await until(() => stand?.standIn.logoffs() === 1);
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
  expect(stand.files()).toHaveLength(1);
});

describe('a debugger connection', () => {
  it('is kept with role debugger, and deleted with its logoff', async () => {
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
    const identity = sessionIdentity(settings);
    if (!identity) throw new Error('no identity');
    owner.track(origin, 'built', identity);
    const context = {
      connection: origin,
      sessionFiles: owner,
      logger: { info() {}, debug() {}, warn() {}, error() {} },
    } as unknown as HandlerContext;
    const debug = await liveDebugPorts().openConnection(context);
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(2);
    const roles = files.map(
      (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).role,
    );
    expect(roles.sort()).toEqual(['built', 'debugger']);
    await endConnection(debug);
    expect(
      fs
        .readdirSync(dir)
        .map(
          (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).role,
        ),
    ).toEqual(['built']);
    await endConnection(origin);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('the owner, without a server', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-owner-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps no identity over RFC, and none without a backend user', () => {
    expect(
      sessionIdentity({
        url: 'http://placeholder.invalid',
        authType: 'basic',
        username: 'PLACEHOLDER_USER',
        connectionType: 'rfc',
      }),
    ).toBeUndefined();
    expect(
      sessionIdentity({ url: 'http://placeholder.invalid', authType: 'jwt' }),
    ).toBeUndefined();
    expect(
      sessionIdentity(
        { url: 'http://placeholder.invalid/', authType: 'jwt' },
        'placeholder_login',
      ),
    ).toMatchObject({
      url: 'http://placeholder.invalid',
      user: 'PLACEHOLDER_LOGIN',
    });
  });

  it('writes nothing for a connection holding no session (an RFC wire answers null)', () => {
    const owner = new LeftoverSessions({
      directory: dir,
      probe: fakeProbe(OUR_PID, new Set()),
    });
    const rfcLike = { sessionCookies: () => null, disconnect: async () => {} };
    owner.track(rfcLike, 'built', {
      url: 'http://placeholder.invalid',
      client: '',
      system: 'onprem',
      wire: 'http',
      user: 'PLACEHOLDER_USER',
    });
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
