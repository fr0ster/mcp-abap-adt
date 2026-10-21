/**
 * A token credential states no backend user. Its session keeps a runtime
 * file all the same — under the destination, with no user — and the
 * leftover-session tools answer its caller from the files and the
 * destination alone: SAP is asked nothing to keep, list or log off.
 */

import {
  DESTINATION,
  json,
  type LeftoverStand,
  leftoverStand,
} from './harness';

jest.setTimeout(30_000);

const isLookup = (r: { url: string }) => r.url.includes('systeminformation');

let stand: LeftoverStand;
let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  await stand?.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  jest.restoreAllMocks();
});

it('writes the file under the destination, with no user, asking SAP no user', async () => {
  // On-premise the connection's own lookup is the one before its first
  // tool; any further one would be the file's.
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  stand = await leftoverStand({ token: { tokenUser: 'TOKEN_USER' } });
  await stand.call('ProbeAdt', { id: 'one' });
  const [handle] = stand.files();
  expect(stand.file(handle ?? '')).toMatchObject({
    role: 'built',
    user: null,
    destination: {
      name: DESTINATION,
      url: stand.standIn.url,
      client: '100',
      system: 'onprem',
    },
  });
  expect(stand.standIn.requests.filter(isLookup)).toHaveLength(1);
});

it("lists and logs off the destination's leftover without a request to SAP but the logoff", async () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  stand = await leftoverStand({ token: {} });
  const mine = await stand.leftover();
  const other = await stand.leftover({ destination: 'OTHER_DEST' });
  const from = stand.standIn.requests.length;
  const listed = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(listed.map((s) => s.handle)).toEqual([mine.handle]);
  const foreign = await stand.call('LogoffLeftoverSession', {
    handle: other.handle,
  });
  expect(json(foreign.text).error).toBe('leftover_session_not_available');
  expect(stand.standIn.requests.length).toBe(from);
  const off = await stand.call('LogoffLeftoverSession', {
    handle: mine.handle,
  });
  expect(json(off.text)).toEqual({ handle: mine.handle, state: 'logged_off' });
  expect(stand.files()).toEqual([other.handle]);
});
