/**
 * Over Streamable HTTP every call's system context comes from
 * `systeminformation`, asked before its tool — on ABAP Cloud and on-premise
 * alike, once per destination (the request's credential and its system).
 * On-premise a `404` is the function unavailable, and the configuration
 * applies when the request states a user (`x-sap-login`); with none the call
 * is `system_user_unknown`; on ABAP Cloud, and for any other failure on both
 * kinds, the call is refused. An answer that names no
 * user — the field missing or blank, a body that is no JSON, JSON that is no
 * object — is `system_without_user`; on ABAP Cloud a `404` is
 * `cloud_without_systeminformation` (every ABAP Cloud system has the
 * function); any other status but a `2xx` (`405`, `501`, `500`) is a failed
 * lookup, `system_lookup_failed`, with no login standing in. The tool never
 * runs.
 */

import type { StandInRequest } from '../../../src/__tests__/helpers/adtStandIn';
import { type HttpStand, httpStand, turns } from './shutdown/harness';

jest.setTimeout(30_000);

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const isProbe = (r: StandInRequest) => r.url.includes('/probe/');

let s: HttpStand;
beforeEach(async () => {
  s = await httpStand();
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(async () => {
  // The server logs a call's completion once its response is flushed: let
  // it, before the stand closes.
  await turns(20);
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

it('ABAP Cloud, systeminformation answered 404: cloud_without_systeminformation, no header stands in, the tool not run', async () => {
  s.standIn.answer(isLookup, 404);
  const answer = await s.call('ProbeAdt', { id: 'NO_LOOKUP' });
  expect(answer.isError).toBe(true);
  expect(JSON.parse(answer.text)).toEqual({
    error: 'cloud_without_systeminformation',
    message:
      'the ABAP Cloud system answered without systeminformation, which every ABAP Cloud system has: the destination is not a valid ABAP Cloud system; the tool did not run',
  });
  expect(answer.text).not.toContain('SHUTDOWN_USER');
  expect(s.standIn.requests.some(isProbe)).toBe(false);
});

it.each([405, 501, 500])(
  'ABAP Cloud, systeminformation answered %i: system_lookup_failed, no login stands in, the tool not run',
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

it('each request is its own destination (its own credential): each asks its own lookup', async () => {
  s.standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  expect((await s.call('ProbeAdt', { id: 'FIRST' })).isError).toBe(false);
  expect((await s.call('ProbeAdt', { id: 'SECOND' })).isError).toBe(false);
  expect(s.standIn.requests.filter(isLookup)).toHaveLength(2);
});

it('systeminformation naming its user: the tool runs', async () => {
  s.standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  const answer = await s.call('ProbeAdt', { id: 'WITH_USER' });
  expect(answer.isError).toBe(false);
  expect(s.standIn.requests.some(isProbe)).toBe(true);
});

describe('on-premise: asked the same way; settings only without the function', () => {
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });

  it('systeminformation naming its user: asked before the tool, which runs', async () => {
    s.standIn.body(
      isLookup,
      JSON.stringify({ userName: 'OP_USER', systemID: 'OPS' }),
    );
    const answer = await s.call('ProbeAdt', { id: 'ONPREM_USER' });
    expect(answer.isError).toBe(false);
    expect(s.standIn.requests.filter(isLookup)).toHaveLength(1);
    expect(s.standIn.requests.findIndex(isProbe)).toBeGreaterThan(
      s.standIn.requests.findIndex(isLookup),
    );
  });

  it('systeminformation answered 404, a token connection stating no user: system_user_unknown, the tool not run, the next call asks again', async () => {
    s.standIn.answer(isLookup, 404);
    const token = {
      'x-sap-url': s.standIn.url,
      'x-sap-client': '100',
      'x-sap-jwt-token': 'token-placeholder',
    };
    for (const id of ['NO_USER_ONE', 'NO_USER_TWO']) {
      const answer = await s.call('ProbeAdt', { id }, token);
      expect(answer.isError).toBe(true);
      expect(JSON.parse(answer.text)).toEqual({
        error: 'system_user_unknown',
        message:
          'the system has no systeminformation and the call states no user: set SAP_USERNAME (the destination or the environment), or send x-sap-login with x-sap-url, so the session user is known; the tool did not run',
      });
    }
    expect(s.standIn.requests.filter(isLookup)).toHaveLength(2);
    expect(s.standIn.requests.some(isProbe)).toBe(false);
  });

  it('systeminformation answered 404 (the function unavailable), x-sap-login states the user: the tool runs with the configuration', async () => {
    s.standIn.answer(isLookup, 404);
    const answer = await s.call('ProbeAdt', { id: 'ONPREM_ABSENT' });
    expect(answer.isError).toBe(false);
    expect(s.standIn.requests.some(isProbe)).toBe(true);
  });

  it.each([405, 500])(
    'systeminformation answered %i: system_lookup_failed, the tool not run',
    async (status) => {
      s.standIn.answer(isLookup, status);
      const answer = await s.call('ProbeAdt', { id: 'ONPREM_FAILED' });
      expect(answer.isError).toBe(true);
      expect(JSON.parse(answer.text)).toMatchObject({
        error: 'system_lookup_failed',
      });
      expect(s.standIn.requests.some(isProbe)).toBe(false);
    },
  );

  it('systeminformation without a user: system_without_user, the tool not run', async () => {
    s.standIn.body(isLookup, JSON.stringify({ systemID: 'OPS' }));
    const answer = await s.call('ProbeAdt', { id: 'ONPREM_NO_USER' });
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.text)).toMatchObject({
      error: 'system_without_user',
    });
    expect(s.standIn.requests.some(isProbe)).toBe(false);
  });
});
