/**
 * Over Streamable HTTP, on ABAP Cloud, every call's system context comes
 * from `systeminformation`, asked before its tool. An answer that names no
 * user — the field missing or blank, a body that is no JSON, JSON that is no
 * object — is `system_without_user`; an absent endpoint (`404`) is a failed
 * lookup, `system_lookup_failed`, with no login standing in; so is any other
 * failure (`405`, `501`). The tool never runs.
 */

import type { StandInRequest } from '../../../src/__tests__/helpers/adtStandIn';
import { type HttpStand, httpStand } from './shutdown/harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const isProbe = (r: StandInRequest) => r.url.includes('/probe/');

let s: HttpStand;
beforeEach(async () => {
  s = await httpStand();
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(async () => {
  await s.close();
});

const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: ' ', systemID: 'CLD' })],
  ['a body that is no JSON', 'not json'],
  ['a JSON array', JSON.stringify([{ userName: 'ARRAY_USER' }])],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

it.each(WITHOUT_USER)(
  'systeminformation with %s: system_without_user, the tool not run',
  async (_what, body) => {
    s.standIn.body(isLookup, body);
    const answer = await s.call('ProbeAdt', { id: 'NO_USER' });
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.text)).toMatchObject({
      error: 'system_without_user',
    });
    expect(s.standIn.requests.filter(isLookup)).toHaveLength(1);
    expect(s.standIn.requests.some(isProbe)).toBe(false);
  },
);

it.each([404, 405, 501])(
  'systeminformation answered %i: system_lookup_failed, no login stands in, the tool not run',
  async (status) => {
    s.standIn.answer(isLookup, status);
    const answer = await s.call('ProbeAdt', { id: 'NO_LOOKUP' });
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.text)).toMatchObject({
      error: 'system_lookup_failed',
    });
    expect(answer.text).not.toContain('SHUTDOWN_USER');
    expect(s.standIn.requests.some(isProbe)).toBe(false);
  },
);

it('systeminformation naming its user: the tool runs', async () => {
  s.standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  const answer = await s.call('ProbeAdt', { id: 'WITH_USER' });
  expect(answer.isError).toBe(false);
  expect(s.standIn.requests.some(isProbe)).toBe(true);
});
