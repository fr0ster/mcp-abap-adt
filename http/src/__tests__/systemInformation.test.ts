/**
 * Over Streamable HTTP every call's system context comes from
 * `systeminformation`, asked before its tool — on ABAP Cloud and on-premise
 * alike, once per destination (the request's credential and its system).
 * When it gives no information: on ABAP Cloud one step to the error — a
 * `404` `cloud_without_systeminformation` (the configuration or headers are
 * inconsistent), an answer that names no user or any other status
 * `system_lookup_failed` (the system's problem), no header standing in;
 * on-premise (a `404`, an answer without a user, an error) the request's
 * headers, when they state a user (`x-sap-login`), else
 * `system_user_unknown`. A refused call's tool never runs.
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
  'ABAP Cloud, systeminformation with %s: system_lookup_failed, the tool not run',
  async (_what, body) => {
    s.standIn.body(isLookup, body);
    const answer = await s.call('ProbeAdt', { id: 'NO_USER' });
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.text)).toMatchObject({
      error: 'system_lookup_failed',
    });
    expect(answer.text).not.toContain('SHUTDOWN_USER');
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
      'the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run',
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

describe('on-premise: asked the same way; the headers when it gives no information', () => {
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

  const NO_INFORMATION: Array<[string, () => void]> = [
    ['answered 404', () => s.standIn.answer(isLookup, 404)],
    ['answered 405', () => s.standIn.answer(isLookup, 405)],
    ['answered 500', () => s.standIn.answer(isLookup, 500)],
    [
      'without a user',
      () => s.standIn.body(isLookup, JSON.stringify({ systemID: 'OPS' })),
    ],
  ];

  it.each(NO_INFORMATION)(
    'systeminformation %s, a token connection stating no user: system_user_unknown, the tool not run, the next call asks again',
    async (_case, answer) => {
      answer();
      const token = {
        'x-sap-url': s.standIn.url,
        'x-sap-client': '100',
        'x-sap-jwt-token': 'token-placeholder',
      };
      for (const id of ['NO_USER_ONE', 'NO_USER_TWO']) {
        const result = await s.call('ProbeAdt', { id }, token);
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.text)).toEqual({
          error: 'system_user_unknown',
          message:
            'the system gave no session user (systeminformation) and the call states no user: set SAP_RESPONSIBLE or SAP_USERNAME (the destination or the environment), or send x-sap-responsible, or x-sap-login with x-sap-url, so the session user is known; the tool did not run',
        });
      }
      expect(s.standIn.requests.filter(isLookup)).toHaveLength(2);
      expect(s.standIn.requests.some(isProbe)).toBe(false);
    },
  );

  it.each(NO_INFORMATION)(
    'systeminformation %s, x-sap-login states the user: the tool runs with the headers',
    async (_case, answer) => {
      answer();
      const result = await s.call('ProbeAdt', { id: 'ONPREM_ABSENT' });
      expect(result.isError).toBe(false);
      expect(s.standIn.requests.some(isProbe)).toBe(true);
    },
  );
});
