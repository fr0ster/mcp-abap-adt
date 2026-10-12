/**
 * The cancelled caller settles first (D32, spec §5.3, §14.4.6): two requests
 * wait in stdio's one shared `connect()` — a browser login whose code
 * exchange the token endpoint holds. R1 is cancelled: it settles `aborted`
 * before the endpoint answers, and its tool is never reached; the login goes
 * on for R2, which gets its token and its answer once the endpoint answers.
 * Nothing rejects unhandled.
 */

import { type Stand, stand, turns, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(async () => {
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
  s = await stand({ auth: 'jwt' });
});

afterEach(async () => {
  await s.close();
  process.off('unhandledRejection', onUnhandled);
});

it('R1 settles aborted before the token endpoint answers; R2 gets its token after', async () => {
  s.tokens.holdCodes(true);
  const r1 = s.call('r1');
  const r2 = s.call('r2');
  await s.tokens.codeArrived();
  // Both have their provider and wait in the one connect().
  await until(() => s.providersAnswered() === 2);
  await turns();
  expect(s.active()).toBe(2);

  r1.cancel();
  await until(() => s.active() === 1);
  // R1 was answered `request_aborted` while the endpoint still held the code.
  expect(s.stderr.join('')).toContain('[MCP] request_aborted');
  expect(s.tokens.grants).toEqual(['authorization_code']);
  expect(await r1.done).toBe('cancelled');

  s.tokens.releaseCodes();
  expect(await r2.done).toEqual({ text: 'r2', isError: false });
  expect(s.reached('r1')).toBe(false);
  expect(s.reached('r2')).toBe(true);
  expect(s.logins).toEqual(['ok']);
  await turns();
  expect(unhandled).toEqual([]);
});
