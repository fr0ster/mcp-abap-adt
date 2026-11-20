/**
 * Over Streamable HTTP the system kind is the process's parameter
 * (`--system-type`, `SAP_SYSTEM_TYPE`, YAML) — no request header states it —
 * and it is required. The binaries do not start without it
 * (`systemTypeAtStart.test.ts`); an embedder's own `StreamableHttpServer`
 * fixes its one kind at construction (`SAP_SYSTEM_TYPE` as it was then,
 * never read again), so a call it lets through without one is refused
 * `system_type_required`, before anything is sent.
 */

import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { format } from 'node:util';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
import { SYSTEM_TYPE_REQUIRED_WORDS } from '../../../../src/lib/auth/serverRefusal';
import { type HttpStand, httpStand, turns } from './shutdown/harness';

let s: HttpStand;
afterEach(async () => {
  await turns(20);
  await s.close();
});

for (const [_what, value] of [
  ['no SAP_SYSTEM_TYPE', null],
  ['an SAP_SYSTEM_TYPE of no kind', 'abap-cloud'],
]) {
  it(
    format(
      '%s at construction: the call is refused system_type_required, nothing sent',
      _what,
    ),
    async () => {
      s = await httpStand({ systemTypeEnv: value });
      // Stated after construction: not read — one kind for the server's life.
      process.env.SAP_SYSTEM_TYPE = 'onprem';
      const answer = await s.call('ProbeAdt', { id: 'NO_KIND' });
      assert.equal(answer.isError, true);
      assertMatchObject(JSON.parse(answer.text), {
        error: 'system_type_required',
        message: SYSTEM_TYPE_REQUIRED_WORDS,
      });
      assert.deepStrictEqual(s.standIn.requests, []);
    },
  );
}

it('stated: the same call reaches the system', async () => {
  s = await httpStand({ systemTypeEnv: 'onprem' });
  const answer = await s.call('ProbeAdt', { id: 'WITH_KIND' });
  assert.equal(answer.isError, false);
  assert.ok(s.standIn.requests.length > 0);
});
