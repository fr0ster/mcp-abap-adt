/**
 * Over Streamable HTTP the system kind is the process's parameter
 * (`--system-type`, `SAP_SYSTEM_TYPE`, YAML) — no request header states it —
 * and it is required. The binaries do not start without it
 * (`systemTypeAtStart.test.ts`); an embedder's own `StreamableHttpServer`
 * host reads `SAP_SYSTEM_TYPE` at each call, so a call it lets through
 * without one is refused `system_type_required`, before anything is sent.
 */

import { SYSTEM_TYPE_REQUIRED_WORDS } from '../../../src/lib/auth/serverRefusal';
import { type HttpStand, httpStand, turns } from './shutdown/harness';

jest.setTimeout(30_000);

let s: HttpStand;
beforeEach(async () => {
  s = await httpStand();
});
afterEach(async () => {
  await turns(20);
  await s.close();
});

it.each([
  ['no SAP_SYSTEM_TYPE', undefined],
  ['an SAP_SYSTEM_TYPE of no kind', 'abap-cloud'],
])(
  '%s: the call is refused system_type_required, nothing sent',
  async (_what, value) => {
    if (value === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = value;
    const answer = await s.call('ProbeAdt', { id: 'NO_KIND' });
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.text)).toMatchObject({
      error: 'system_type_required',
      message: SYSTEM_TYPE_REQUIRED_WORDS,
    });
    expect(s.standIn.requests).toEqual([]);
  },
);

it('stated: the same call reaches the system', async () => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const answer = await s.call('ProbeAdt', { id: 'WITH_KIND' });
  expect(answer.isError).toBe(false);
  expect(s.standIn.requests.length).toBeGreaterThan(0);
});
