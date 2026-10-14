/**
 * A stdio instance's connection is born at its start, before any tool call
 * (`bornAtStart`), with the rules core passes: its parameters are made with
 * it — from the leftover's file when it carries the system information, else
 * asked — and a refusal of the rules ends the start (on-premise with no user
 * stated, ABAP Cloud without the information). A tool after the start runs
 * on the born connection with those parameters.
 *
 * Against the stand-in, whose request log shows every request SAP got.
 */

import {
  isLogoff,
  PROBE_PATH,
  type StandInRequest,
} from '../../../../src/__tests__/helpers/adtStandIn';
import {
  json,
  type LeftoverStand,
  leftoverStand as libLeftoverStand,
  OUR_PID,
  until,
} from '../../../../src/__tests__/unit/leftoverSessions/harness';
import {
  latch,
  resetProcessLatchForTests,
} from '../../../../src/lib/activeTools';
import { ClosedInstanceRefusal } from '../../../../src/lib/auth/failures';
import { ServerRefusal } from '../../../../src/lib/auth/serverRefusal';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { requireSystemContextForCreate } from '../../../../src/lib/systemContextGuard';
import { responsibleRules } from '../../index';

/** A stdio start's stand (`core`), with the rules core passes. */
const leftoverStand = (
  options: Parameters<typeof libLeftoverStand>[0] = {},
): Promise<LeftoverStand> =>
  libLeftoverStand({ systemContextRules: responsibleRules, ...options });

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
    '%s with a responsible stated and no login: the start succeeds',
    async (_case, answer) => {
      stand = await leftoverStand({ token: { statedResponsible: 'RESP' } });
      answer();
      expect(await stand.start()).toEqual({ session: 'logged_on' });
      expect(stand.standIn.logoffs()).toBe(0);
    },
  );

  it('a blank responsible stated and no login counts as none', async () => {
    stand = await leftoverStand({ token: { statedResponsible: '  ' } });
    stand.standIn.answer(isLookup, 404);
    await expect(stand.start()).rejects.toMatchObject({
      serverRefusal: 'system_user_unknown',
    });
  });

  it.each(NO_INFORMATION)(
    '%s with both a responsible and a login stated: the start succeeds',
    async (_case, answer) => {
      stand = await leftoverStand({
        token: { statedUser: 'STATED', statedResponsible: 'RESP' },
      });
      answer();
      expect(await stand.start()).toEqual({ session: 'logged_on' });
    },
  );

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
