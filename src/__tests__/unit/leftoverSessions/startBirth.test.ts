/**
 * A stdio instance's connection is born at its start, before any tool call
 * (`bornAtStart`): the one leftover session of its destination — a dead
 * process's, role `built` — is taken up; none, or more than one, is a normal
 * logon, and several are left as they are for the list and the logoff. A
 * debugger's session is never taken up. Then the system information: from
 * the file when it carries it, else asked; a failure ends the start. A tool
 * after the start runs on the born connection, with no further logon.
 *
 * Against the stand-in, whose request log shows every request SAP got.
 */

import { latch, resetProcessLatchForTests } from '../../../lib/activeTools';
import { ClosedInstanceRefusal } from '../../../lib/auth/failures';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import { ownedConnections } from '../../../lib/ownedConnections';
import { requireSystemContextForCreate } from '../../../lib/systemContextGuard';
import {
  isLogoff,
  PROBE_PATH,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import {
  json,
  type LeftoverStand,
  leftoverStand,
  OUR_PID,
  until,
} from './harness';

jest.setTimeout(30_000);

let stand: LeftoverStand;
let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  jest.restoreAllMocks();
  resetProcessLatchForTests();
});

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const sessionOf = (id: string) =>
  stand.standIn.requests.find((r) => r.url === `${PROBE_PATH}${id}`)?.session;
/** The sessions SAP saw requests in since `from`. */
const sessionsSince = (from: number) =>
  new Set(stand.standIn.requests.slice(from).map((r) => r.session));
/** The sessions whose requests carried the credential: logons. */
const logons = (from = 0) =>
  new Set(
    stand.standIn.requests
      .slice(from)
      .filter((r) => r.authorization !== undefined)
      .map((r) => r.session),
  );

/** `NeedsResponsible`: reads the responsible a create needs and sends it as a probe. */
const needsResponsible = {
  toolDefinition: {
    name: 'NeedsResponsible',
    description: 'NeedsResponsible',
    inputSchema: { type: 'object', properties: {} },
  },
  handler: (async (
    context: { connection: { makeAdtRequest(o: object): Promise<unknown> } },
    _args: unknown,
  ) => {
    const { responsible } = requireSystemContextForCreate();
    await context.connection.makeAdtRequest({
      url: `${PROBE_PATH}${responsible}`,
      method: 'GET',
      timeout: 10_000,
    });
    return { content: [{ type: 'text', text: responsible }] };
  }) as never,
} as never;

describe('one leftover session of the destination', () => {
  it('still alive: picked up at the start — no logon, no tool call needed — and the next tool runs in it', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    const from = stand.standIn.requests.length;

    expect(await stand.start()).toEqual({ session: 'picked_up', handle });
    const born = stand.standIn.requests.slice(from);
    expect(born.length).toBeGreaterThan(0);
    // All in the old session — no logon; the takeover's request without
    // the credential. (The system lookup that follows goes on that session
    // as every request of a basic connection does.)
    for (const r of born) expect(r.session).toBe(session);
    expect(born[0]?.authorization).toBeUndefined();
    // The file is this process's, under the same handle.
    expect(stand.files()).toEqual([handle]);
    expect(stand.file(handle)).toMatchObject({
      pid: OUR_PID,
      role: 'built',
      cookies: expect.stringContaining(`=${session}`),
    });

    const before = stand.standIn.requests.length;
    expect((await stand.call('ProbeAdt', { id: 'after' })).isError).toBe(false);
    expect(sessionOf('after')).toBe(session);
    // No further logon: no session but the picked-up one.
    expect(sessionsSince(before)).toEqual(new Set([session]));
    expect(stand.standIn.logoffs()).toBe(0);
  });

  it('the process is shutting down at the start: the claimed file is given back as a leftover, the start refused', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    latch();
    await expect(stand.start()).rejects.toBeInstanceOf(ClosedInstanceRefusal);
    expect(stand.files()).toEqual([handle]);
    expect(stand.file(handle)).toMatchObject({ pid: 111 });
  });

  it('SAP answers 401 for it: a new session with the normal logon, the file rewritten under the same handle', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    const from = stand.standIn.requests.length;

    expect(await stand.start()).toEqual({ session: 'new', handle });
    const sent = stand.standIn.requests.slice(from);
    // The takeover's request in the old session, without the credential;
    // then one logon, with it, in one new session.
    expect(sent[0]?.session).toBe(session);
    expect(sent[0]?.authorization).toBeUndefined();
    const fresh = [...logons(from)];
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).not.toBe(session);
    expect(stand.files()).toEqual([handle]);
    const pairs = String(stand.file(handle).cookies).split('; ');
    expect(pairs).toContain(`SAP_SESSIONID_X01_100=${fresh[0]}`);

    const before = stand.standIn.requests.length;
    await stand.call('ProbeAdt', { id: 'next' });
    expect(sessionOf('next')).toBe(fresh[0]);
    expect(sessionsSince(before)).toEqual(new Set([fresh[0]]));
  });

  it('a 2xx naming another session than the old one: a new session with the normal logon', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.body((r) => r.session === session, '', {
      'set-cookie': 'SAP_SESSIONID_X01_100=another-session; path=/',
    });
    expect(await stand.start()).toEqual({ session: 'new', handle });
    expect(stand.files()).toEqual([handle]);
  });

  it('a redirect is not "gone": the start fails as SAP answered, no logon is tried, and the file is a leftover again', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 302);
    const from = stand.standIn.requests.length;
    await expect(stand.start()).rejects.toBeDefined();
    expect(logons(from).size).toBe(0);
    expect(stand.files()).toEqual([handle]);
    expect(stand.file(handle)).toMatchObject({ pid: 111 });
  });

  it('a 500: the start fails, and the file is a leftover again', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 500);
    await expect(stand.start()).rejects.toBeDefined();
    expect(stand.files()).toEqual([handle]);
  });

  it('a gone session whose new logon SAP refuses: the start fails, the file given back under its handle', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    stand.standIn.refuse(true);
    await expect(stand.start()).rejects.toBeDefined();
    expect(stand.files()).toEqual([handle]);
    expect(stand.file(handle)).toMatchObject({ pid: 111 });
  });

  it('a debugger’s session is not taken up: a normal logon, and the file is left for the list and the logoff', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover({ role: 'debugger' });
    const from = stand.standIn.requests.length;
    expect(await stand.start()).toEqual({ session: 'logged_on' });
    expect(logons(from).size).toBe(1);
    expect(
      stand.standIn.requests.slice(from).some((r) => r.session === session),
    ).toBe(false);
    expect(stand.files()).toContain(handle);
    expect(stand.file(handle)).toMatchObject({ pid: 111, role: 'debugger' });
  });

  it('another destination’s session is not this start’s: a normal logon', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover({ destination: 'OTHER_DEST' });
    expect(await stand.start()).toEqual({ session: 'logged_on' });
    expect(stand.files()).toContain(handle);
    expect(stand.file(handle)).toMatchObject({ pid: 111 });
  });
});

/** What a system that gives no information answers. */
const NO_INFORMATION: Array<[string, () => void]> = [
  ['no systeminformation (404)', () => stand.standIn.systemInformation(null)],
  [
    'an answer without a user',
    () => {
      stand.standIn.systemInformation(undefined);
      stand.standIn.body(isLookup, JSON.stringify({ systemID: 'OPS' }));
    },
  ],
  [
    'an error (500)',
    () => {
      stand.standIn.systemInformation(undefined);
      stand.standIn.answer(isLookup, 500);
    },
  ],
];

describe('on-premise without the information: the start needs a stated user', () => {
  it.each(NO_INFORMATION)(
    'a passwordless logon, %s, no user stated: the start fails as system_user_unknown, the logon logged off, nothing owned',
    async (_case, answer) => {
      stand = await leftoverStand({ token: {} });
      answer();
      const refused = await stand.start().then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(ServerRefusal);
      expect((refused as ServerRefusal).serverRefusal).toBe(
        'system_user_unknown',
      );
      await until(() => stand.standIn.logoffs() === 1);
      expect(ownedConnections(stand.server)).toEqual([]);
    },
  );

  it('a blank user stated counts as none', async () => {
    stand = await leftoverStand({ token: { statedUser: '  ' } });
    stand.standIn.answer(isLookup, 404);
    await expect(stand.start()).rejects.toMatchObject({
      serverRefusal: 'system_user_unknown',
    });
  });

  it.each(NO_INFORMATION)(
    '%s with a user stated: the start succeeds',
    async (_case, answer) => {
      stand = await leftoverStand({ token: { statedUser: 'STATED' } });
      answer();
      expect(await stand.start()).toEqual({ session: 'logged_on' });
      expect(stand.standIn.logoffs()).toBe(0);
    },
  );
});

describe('no leftover session, or several', () => {
  it('none: a normal logon at the start, and a tool afterwards runs on it with no further logon', async () => {
    stand = await leftoverStand();
    expect(await stand.start()).toEqual({ session: 'logged_on' });
    const born = [...logons()];
    expect(born).toHaveLength(1);
    // Its own runtime file, as any logon's.
    expect(stand.files()).toHaveLength(1);

    const before = stand.standIn.requests.length;
    await stand.call('ProbeAdt', { id: 'after' });
    expect(sessionOf('after')).toBe(born[0]);
    expect(sessionsSince(before)).toEqual(new Set([born[0]]));
  });

  it('two: a normal logon, neither is picked, and both files stay untouched', async () => {
    stand = await leftoverStand();
    const first = await stand.leftover();
    const second = await stand.leftover();
    const files = {
      [first.handle]: stand.file(first.handle),
      [second.handle]: stand.file(second.handle),
    };
    const from = stand.standIn.requests.length;
    expect(await stand.start()).toEqual({ session: 'logged_on' });
    const sent = stand.standIn.requests.slice(from);
    expect(sent.some((r) => r.session === first.session)).toBe(false);
    expect(sent.some((r) => r.session === second.session)).toBe(false);
    expect(logons(from).size).toBe(1);
    expect(stand.file(first.handle)).toEqual(files[first.handle]);
    expect(stand.file(second.handle)).toEqual(files[second.handle]);
    // Still listed for the user.
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string }>;
    expect(listed.map((s) => s.handle).sort()).toEqual(
      [first.handle, second.handle].sort(),
    );
  });

  it('a logon SAP refuses: the start fails, and nothing is kept', async () => {
    stand = await leftoverStand();
    stand.standIn.refuse(true);
    await expect(stand.start()).rejects.toBeDefined();
    expect(stand.files()).toEqual([]);
  });
});

describe('ABAP Cloud: the system information at the start', () => {
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
  });

  it('a logon: asked once at the start, kept in the file, and the first create reads it without a lookup', async () => {
    stand = await leftoverStand({ extra: [needsResponsible] });
    stand.standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    expect(await stand.start()).toEqual({ session: 'logged_on' });
    expect(stand.standIn.requests.filter(isLookup)).toHaveLength(1);
    const [handle] = stand.files();
    expect(stand.file(handle ?? '')).toMatchObject({
      format: 3,
      system: { responsible: 'CLOUD_USER', master_system: 'CLD' },
    });

    const before = stand.standIn.requests.length;
    const created = await stand.call('NeedsResponsible');
    expect(created).toEqual({ text: 'CLOUD_USER', isError: false });
    expect(stand.standIn.requests.slice(before).filter(isLookup)).toEqual([]);
  });

  it('a leftover whose file carries it: picked up with no lookup at all, and the create reads it', async () => {
    stand = await leftoverStand({ extra: [needsResponsible] });
    const { handle, session } = await stand.leftover({
      system: { responsible: 'FILE_USER', masterSystem: 'FIL' },
    });
    expect(await stand.start()).toEqual({ session: 'picked_up', handle });
    expect(stand.standIn.requests.filter(isLookup)).toEqual([]);
    expect(stand.file(handle)).toMatchObject({
      system: { responsible: 'FILE_USER', master_system: 'FIL' },
    });
    const created = await stand.call('NeedsResponsible');
    expect(created).toEqual({ text: 'FILE_USER', isError: false });
    expect(sessionOf('FILE_USER')).toBe(session);
    expect(stand.standIn.requests.filter(isLookup)).toEqual([]);
  });

  it('a gone leftover whose file carries it: the new session asks none — the same destination — and the create reads the file’s', async () => {
    stand = await leftoverStand({ extra: [needsResponsible] });
    const { handle, session } = await stand.leftover({
      system: { responsible: 'FILE_USER', masterSystem: 'FIL' },
    });
    stand.standIn.answer((r) => r.session === session, 401);
    stand.standIn.body(
      isLookup,
      JSON.stringify({ userName: 'OTHER_USER', systemID: 'OTH' }),
    );
    expect(await stand.start()).toEqual({ session: 'new', handle });
    expect(stand.file(handle)).toMatchObject({
      system: { responsible: 'FILE_USER', master_system: 'FIL' },
    });
    const created = await stand.call('NeedsResponsible');
    expect(created).toEqual({ text: 'FILE_USER', isError: false });
    expect(stand.standIn.requests.filter(isLookup)).toEqual([]);
  });

  it('a leftover whose file carries none: asked at the start, in the resumed session', async () => {
    stand = await leftoverStand();
    stand.standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    const { handle, session } = await stand.leftover();
    const from = stand.standIn.requests.length;
    expect(await stand.start()).toEqual({ session: 'picked_up', handle });
    const lookups = stand.standIn.requests.slice(from).filter(isLookup);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.session).toBe(session);
    expect(stand.file(handle)).toMatchObject({
      system: { responsible: 'CLOUD_USER', master_system: 'CLD' },
    });
  });

  it.each([
    [
      'no systeminformation (404)',
      () => stand.standIn.answer(isLookup, 404),
      'cloud_without_systeminformation',
    ],
    [
      'an answer without a user',
      () => {
        stand.standIn.systemInformation(undefined);
        stand.standIn.body(isLookup, JSON.stringify({ systemID: 'CLD' }));
      },
      'system_lookup_failed',
    ],
    [
      'an error (500)',
      () => {
        stand.standIn.systemInformation(undefined);
        stand.standIn.answer(isLookup, 500);
      },
      'system_lookup_failed',
    ],
  ] as const)(
    '%s: one step to the error — the start fails as $2, a stated user not used',
    async (_case, answer, code) => {
      stand = await leftoverStand({ token: { statedUser: 'STATED' } });
      answer();
      await expect(stand.start()).rejects.toMatchObject({
        serverRefusal: code,
      });
      await until(() => stand.standIn.logoffs() === 1);
    },
  );

  it('no system information to be had: the start fails, and the logon made for it is logged off', async () => {
    stand = await leftoverStand();
    stand.standIn.answer(isLookup, 500);
    await expect(stand.start()).rejects.toMatchObject({
      message: expect.stringContaining('systeminformation'),
    });
    await until(() => stand.standIn.logoffs() === 1);
    expect(stand.files()).toEqual([]);
  });

  it('a gone leftover whose new logon then finds no system information: the start fails, and the new session is logged off', async () => {
    stand = await leftoverStand();
    const { session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    stand.standIn.answer(isLookup, 500);
    await expect(stand.start()).rejects.toBeDefined();
    await until(() => stand.standIn.logoffs() === 1);
    expect(stand.files()).toEqual([]);
  });

  it('latched while its system information is asked: the start is refused, and the picked-up session ends with its logoff', async () => {
    stand = await leftoverStand();
    stand.standIn.body(
      isLookup,
      JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
    );
    const { session } = await stand.leftover();
    const held = stand.standIn.hold(isLookup);
    const started = stand.start();
    const refused = expect(started).rejects.toBeInstanceOf(
      ClosedInstanceRefusal,
    );
    await held.arrived;
    latch();
    held.release();
    await refused;
    await until(() => stand.standIn.logoffs() === 1);
    expect(stand.standIn.loggedOff()).toEqual([session]);
    expect(ownedConnections(stand.server)).toEqual([]);
    // Logged off: its file is gone with it.
    expect(stand.files()).toEqual([]);
  });

  it('latched while a leftover carrying its system information is resumed: the start is refused, the file a leftover again, nothing owned', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover({
      system: { responsible: 'FILE_USER', masterSystem: 'FIL' },
    });
    const held = stand.standIn.hold(
      (r) => r.session === session && !isLogoff(r.url),
    );
    const started = stand.start();
    const refused = expect(started).rejects.toBeInstanceOf(
      ClosedInstanceRefusal,
    );
    await held.arrived;
    latch();
    held.release();
    await refused;
    expect(stand.files()).toEqual([handle]);
    expect(stand.file(handle)).toMatchObject({ pid: 111 });
    expect(ownedConnections(stand.server)).toEqual([]);
    expect(stand.standIn.requests.filter(isLookup)).toEqual([]);
  });

  it('no system information for a picked-up session: the start fails, and the session is not logged off', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    stand.standIn.answer(isLookup, 500);
    await expect(stand.start()).rejects.toBeDefined();
    expect(stand.standIn.logoffs()).toBe(0);
    expect(stand.files()).toEqual([handle]);
  });
});
