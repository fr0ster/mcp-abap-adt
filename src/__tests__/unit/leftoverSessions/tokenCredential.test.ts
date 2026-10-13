/**
 * A token credential states no backend user (owner's decision on C21): the
 * user is asked of SAP after `connect()` — `systeminformation`'s
 * `userName`, the debugger's way (`systemUserOf`) — so such a session keeps
 * a runtime file under the user SAP answered, and the leftover-session
 * tools answer the caller for that user. A system that names none keeps no
 * file, and its caller owns none.
 */

import { json, type LeftoverStand, leftoverStand } from './harness';

jest.setTimeout(30_000);

let stand: LeftoverStand;

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  jest.restoreAllMocks();
});

it('writes the file under the user SAP answered', async () => {
  stand = await leftoverStand({ token: { tokenUser: 'token_user' } });
  await stand.call('ProbeAdt', { id: 'one' });
  const [handle] = stand.files();
  expect(stand.file(handle ?? '')).toMatchObject({
    role: 'built',
    user: 'TOKEN_USER',
    destination: { url: stand.standIn.url, client: '100', system: 'cloud' },
  });
});

it("ownership checks against SAP's user: its own leftover is listed and logged off, another's is not", async () => {
  stand = await leftoverStand({ token: { tokenUser: 'TOKEN_USER' } });
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  try {
    const mine = await stand.leftover({ user: 'TOKEN_USER' });
    const other = await stand.leftover({ user: 'OTHER_USER' });
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string; user: string }>;
    expect(listed.map((s) => s.handle)).toEqual([mine.handle]);
    expect(listed[0]?.user).toBe('TOKEN_USER');
    const foreign = await stand.call('LogoffLeftoverSession', {
      handle: other.handle,
    });
    expect(json(foreign.text).error).toBe('leftover_session_not_available');
    const off = await stand.call('LogoffLeftoverSession', {
      handle: mine.handle,
    });
    expect(json(off.text)).toEqual({
      handle: mine.handle,
      state: 'logged_off',
    });
  } finally {
    delete process.env.SAP_SYSTEM_TYPE;
  }
});

it('a system that names no user: no file, and nothing is the caller’s', async () => {
  stand = await leftoverStand({ token: {} });
  await stand.call('ProbeAdt', { id: 'one' });
  expect(stand.files()).toEqual([]);
  const listed = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as unknown[];
  expect(listed).toEqual([]);
});
