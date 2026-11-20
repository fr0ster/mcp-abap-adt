/**
 * A token credential states no backend user. Its session keeps a runtime
 * file all the same — under the destination, with no user — and the
 * leftover-session tools answer its caller from the files and the
 * destination alone: SAP is asked nothing to keep, list or log off.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { assertMatchObject } from '../../helpers/assertions';
import {
  DESTINATION,
  json,
  type LeftoverStand,
  leftoverStand,
} from './harness';

const isLookup = (r: { url: string }) => r.url.includes('systeminformation');

let stand: LeftoverStand;
let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  mock.method(process.stderr, 'write', () => true);
});

afterEach(async () => {
  await stand?.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  mock.restoreAll();
});

it('writes the file under the destination, with no user, asking SAP no user', async () => {
  // On-premise the connection's own lookup is the one before its first
  // tool; any further one would be the file's.
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  stand = await leftoverStand({ token: { tokenUser: 'TOKEN_USER' } });
  await stand.call('ProbeAdt', { id: 'one' });
  const [handle] = stand.files();
  assertMatchObject(stand.file(handle ?? ''), {
    role: 'built',
    user: null,
    destination: {
      name: DESTINATION,
      url: stand.standIn.url,
      client: '100',
      system: 'onprem',
    },
  });
  assert.equal(stand.standIn.requests.filter(isLookup).length, 1);
});

it("lists and logs off the destination's leftover without a request to SAP but the logoff", async () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  stand = await leftoverStand({ token: {} });
  const mine = await stand.leftover();
  const other = await stand.leftover({ destination: 'OTHER_DEST' });
  const from = stand.standIn.requests.length;
  const listed = json((await stand.call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  assert.deepStrictEqual(
    listed.map((s) => s.handle),
    [mine.handle],
  );
  const foreign = await stand.call('LogoffLeftoverSession', {
    handle: other.handle,
  });
  assert.equal(json(foreign.text).error, 'leftover_session_not_available');
  assert.equal(stand.standIn.requests.length, from);
  const off = await stand.call('LogoffLeftoverSession', {
    handle: mine.handle,
  });
  assert.deepStrictEqual(json(off.text), {
    handle: mine.handle,
    state: 'logged_off',
  });
  assert.deepStrictEqual(stand.files(), [other.handle]);
});
