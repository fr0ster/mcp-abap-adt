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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import type { StandInRequest } from '../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
import { type HttpStand, httpStand, turns } from './shutdown/harness';

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const isProbe = (r: StandInRequest) => r.url.includes('/probe/');

let s: HttpStand;
beforeEach(async () => {
  // The server's one kind, fixed at its construction.
  s = await httpStand({ systemTypeEnv: 'cloud' });
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

for (const [_what, body] of WITHOUT_USER) {
  it(
    format(
      'ABAP Cloud, systeminformation with %s: system_lookup_failed, the tool not run',
      _what,
    ),
    async () => {
      s.standIn.body(isLookup, body);
      const answer = await s.call('ProbeAdt', { id: 'NO_USER' });
      assert.equal(answer.isError, true);
      assertMatchObject(JSON.parse(answer.text), {
        error: 'system_lookup_failed',
      });
      assert.ok(!answer.text.includes('SHUTDOWN_USER'));
      assert.equal(s.standIn.requests.filter(isLookup).length, 1);
      assert.equal(s.standIn.requests.some(isProbe), false);
    },
  );
}

it('ABAP Cloud, systeminformation answered 404: cloud_without_systeminformation, no header stands in, the tool not run', async () => {
  s.standIn.answer(isLookup, 404);
  const answer = await s.call('ProbeAdt', { id: 'NO_LOOKUP' });
  assert.equal(answer.isError, true);
  assert.deepStrictEqual(JSON.parse(answer.text), {
    error: 'cloud_without_systeminformation',
    message:
      'the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run',
  });
  assert.ok(!answer.text.includes('SHUTDOWN_USER'));
  assert.equal(s.standIn.requests.some(isProbe), false);
});

for (const status of [405, 501, 500]) {
  it(
    format(
      'ABAP Cloud, systeminformation answered %i: system_lookup_failed, no login stands in, the tool not run',
      status,
    ),
    async () => {
      s.standIn.answer(isLookup, status);
      const answer = await s.call('ProbeAdt', { id: 'NO_LOOKUP' });
      assert.equal(answer.isError, true);
      assertMatchObject(JSON.parse(answer.text), {
        error: 'system_lookup_failed',
      });
      assert.ok(!answer.text.includes('SHUTDOWN_USER'));
      assert.equal(s.standIn.requests.some(isProbe), false);
    },
  );
}

it('each request is its own destination (its own credential): each asks its own lookup', async () => {
  s.standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  assert.equal((await s.call('ProbeAdt', { id: 'FIRST' })).isError, false);
  assert.equal((await s.call('ProbeAdt', { id: 'SECOND' })).isError, false);
  assert.equal(s.standIn.requests.filter(isLookup).length, 2);
});

it('systeminformation naming its user: the tool runs', async () => {
  s.standIn.body(
    isLookup,
    JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
  );
  const answer = await s.call('ProbeAdt', { id: 'WITH_USER' });
  assert.equal(answer.isError, false);
  assert.equal(s.standIn.requests.some(isProbe), true);
});

describe('on-premise: asked the same way; the headers when it gives no information', () => {
  beforeEach(async () => {
    // An on-premise server: its one kind, fixed at its construction.
    await s.close();
    s = await httpStand({ systemTypeEnv: 'onprem' });
  });

  it('systeminformation naming its user: asked before the tool, which runs', async () => {
    s.standIn.body(
      isLookup,
      JSON.stringify({ userName: 'OP_USER', systemID: 'OPS' }),
    );
    const answer = await s.call('ProbeAdt', { id: 'ONPREM_USER' });
    assert.equal(answer.isError, false);
    assert.equal(s.standIn.requests.filter(isLookup).length, 1);
    assert.ok(
      s.standIn.requests.findIndex(isProbe) >
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

  for (const [_case, answer] of NO_INFORMATION) {
    it(
      format(
        'systeminformation %s, a token connection stating no user: system_user_unknown, the tool not run, the next call asks again',
        _case,
      ),
      async () => {
        answer();
        const token = {
          'x-sap-url': s.standIn.url,
          'x-sap-client': '100',
          'x-sap-jwt-token': 'token-placeholder',
        };
        for (const id of ['NO_USER_ONE', 'NO_USER_TWO']) {
          const result = await s.call('ProbeAdt', { id }, token);
          assert.equal(result.isError, true);
          assert.deepStrictEqual(JSON.parse(result.text), {
            error: 'system_user_unknown',
            message:
              'the system gave no session user (systeminformation) and the call states no user: set SAP_RESPONSIBLE or SAP_USERNAME (the destination or the environment), or send x-sap-responsible, or x-sap-login with x-sap-url, so the session user is known; the tool did not run',
          });
        }
        assert.equal(s.standIn.requests.filter(isLookup).length, 2);
        assert.equal(s.standIn.requests.some(isProbe), false);
      },
    );
  }

  for (const [_case, answer] of NO_INFORMATION) {
    it(
      format(
        'systeminformation %s, x-sap-login states the user: the tool runs with the headers',
        _case,
      ),
      async () => {
        answer();
        const result = await s.call('ProbeAdt', { id: 'ONPREM_ABSENT' });
        assert.equal(result.isError, false);
        assert.equal(s.standIn.requests.some(isProbe), true);
      },
    );
  }
});
