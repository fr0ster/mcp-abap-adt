import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import * as z from 'zod';
import { assertMatchObject, rejectionOf } from '../../helpers/assertions';
/**
 * A stdio instance's connection is born at its start, before any tool call
 * (`bornAtStart`): the one leftover session of its destination — a dead
 * process's, role `built` — is taken up; none, or more than one, is a normal
 * logon, and several are left as they are for the list and the logoff. A
 * debugger's session is never taken up. Its parameters are made with it
 * (here with no rules: the information, from the file when it carries it,
 * else asked — the rules' start checks are responsible-rules' suite). A tool
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

let stand: LeftoverStand;
let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  mock.method(process.stderr, 'write', () => true);
});

afterEach(async () => {
  await stand?.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  mock.restoreAll();
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
    inputSchema: z.object({}),
  },
  call: (async (
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

    assert.deepStrictEqual(await stand.start(), {
      session: 'picked_up',
      handle,
    });
    const born = stand.standIn.requests.slice(from);
    assert.ok(born.length > 0);
    // All in the old session — no logon; the takeover's request without
    // the credential. (The system lookup that follows goes on that session
    // as every request of a basic connection does.)
    for (const r of born) assert.equal(r.session, session);
    assert.equal(born[0]?.authorization, undefined);
    // The file is this process's, under the same handle.
    assert.deepStrictEqual(stand.files(), [handle]);
    {
      const written = stand.file(handle);
      assertMatchObject(written, { pid: OUR_PID, role: 'built' });
      const cookies = written?.cookies;
      assert.ok(typeof cookies === 'string' && cookies.includes(`=${session}`));
    }

    const before = stand.standIn.requests.length;
    assert.equal(
      (await stand.call('ProbeAdt', { id: 'after' })).isError,
      false,
    );
    assert.equal(sessionOf('after'), session);
    // No further logon: no session but the picked-up one.
    assert.deepStrictEqual(sessionsSince(before), new Set([session]));
    assert.equal(stand.standIn.logoffs(), 0);
  });

  it('the process is shutting down at the start: the claimed file is given back as a leftover, the start refused', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    latch();
    assert.ok(
      (await rejectionOf(stand.start())) instanceof ClosedInstanceRefusal,
    );
    assert.deepStrictEqual(stand.files(), [handle]);
    assertMatchObject(stand.file(handle), { pid: 111 });
  });

  it('SAP answers 401 for it: a new session with the normal logon, the file rewritten under the same handle', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    const from = stand.standIn.requests.length;

    assert.deepStrictEqual(await stand.start(), { session: 'new', handle });
    const sent = stand.standIn.requests.slice(from);
    // The takeover's request in the old session, without the credential;
    // then one logon, with it, in one new session.
    assert.equal(sent[0]?.session, session);
    assert.equal(sent[0]?.authorization, undefined);
    const fresh = [...logons(from)];
    assert.equal(fresh.length, 1);
    assert.notEqual(fresh[0], session);
    assert.deepStrictEqual(stand.files(), [handle]);
    const pairs = String(stand.file(handle).cookies).split('; ');
    assert.ok(pairs.includes(`SAP_SESSIONID_X01_100=${fresh[0]}`));

    const before = stand.standIn.requests.length;
    await stand.call('ProbeAdt', { id: 'next' });
    assert.equal(sessionOf('next'), fresh[0]);
    assert.deepStrictEqual(sessionsSince(before), new Set([fresh[0]]));
  });

  it('a 2xx naming another session than the old one: a new session with the normal logon', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.body((r) => r.session === session, '', {
      'set-cookie': 'SAP_SESSIONID_X01_100=another-session; path=/',
    });
    assert.deepStrictEqual(await stand.start(), { session: 'new', handle });
    assert.deepStrictEqual(stand.files(), [handle]);
  });

  it('a redirect is not "gone": the start fails as SAP answered, no logon is tried, and the file is a leftover again', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 302);
    const from = stand.standIn.requests.length;
    assert.notEqual(await rejectionOf(stand.start()), undefined);
    assert.equal(logons(from).size, 0);
    assert.deepStrictEqual(stand.files(), [handle]);
    assertMatchObject(stand.file(handle), { pid: 111 });
  });

  it('a 500: the start fails, and the file is a leftover again', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 500);
    assert.notEqual(await rejectionOf(stand.start()), undefined);
    assert.deepStrictEqual(stand.files(), [handle]);
  });

  it('a gone session whose new logon SAP refuses: the start fails, the file given back under its handle', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    stand.standIn.refuse(true);
    assert.notEqual(await rejectionOf(stand.start()), undefined);
    assert.deepStrictEqual(stand.files(), [handle]);
    assertMatchObject(stand.file(handle), { pid: 111 });
  });

  it('a debugger’s session is not taken up: a normal logon, and the file is left for the list and the logoff', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover({ role: 'debugger' });
    const from = stand.standIn.requests.length;
    assert.deepStrictEqual(await stand.start(), { session: 'logged_on' });
    assert.equal(logons(from).size, 1);
    assert.equal(
      stand.standIn.requests.slice(from).some((r) => r.session === session),
      false,
    );
    assert.ok(stand.files().includes(handle));
    assertMatchObject(stand.file(handle), { pid: 111, role: 'debugger' });
  });

  it('another destination’s session is not this start’s: a normal logon', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover({ destination: 'OTHER_DEST' });
    assert.deepStrictEqual(await stand.start(), { session: 'logged_on' });
    assert.ok(stand.files().includes(handle));
    assertMatchObject(stand.file(handle), { pid: 111 });
  });
});

/** What a system that gives no information answers. */
describe('no leftover session, or several', () => {
  it('none: a normal logon at the start, and a tool afterwards runs on it with no further logon', async () => {
    stand = await leftoverStand();
    assert.deepStrictEqual(await stand.start(), { session: 'logged_on' });
    const born = [...logons()];
    assert.equal(born.length, 1);
    // Its own runtime file, as any logon's.
    assert.equal(stand.files().length, 1);

    const before = stand.standIn.requests.length;
    await stand.call('ProbeAdt', { id: 'after' });
    assert.equal(sessionOf('after'), born[0]);
    assert.deepStrictEqual(sessionsSince(before), new Set([born[0]]));
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
    assert.deepStrictEqual(await stand.start(), { session: 'logged_on' });
    const sent = stand.standIn.requests.slice(from);
    assert.equal(
      sent.some((r) => r.session === first.session),
      false,
    );
    assert.equal(
      sent.some((r) => r.session === second.session),
      false,
    );
    assert.equal(logons(from).size, 1);
    assert.deepStrictEqual(stand.file(first.handle), files[first.handle]);
    assert.deepStrictEqual(stand.file(second.handle), files[second.handle]);
    // Still listed for the user.
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string }>;
    assert.deepStrictEqual(
      listed.map((s) => s.handle).sort(),
      [first.handle, second.handle].sort(),
    );
  });

  it('a logon SAP refuses: the start fails, and nothing is kept', async () => {
    stand = await leftoverStand();
    stand.standIn.refuse(true);
    assert.notEqual(await rejectionOf(stand.start()), undefined);
    assert.deepStrictEqual(stand.files(), []);
  });
});
