/**
 * A cancel aborts nothing (a tool call cannot be cancelled): two requests
 * wait in stdio's one shared `connect()` — a browser login whose code
 * exchange the token endpoint holds. R1 is sent a cancel: it stays a live
 * call; once the endpoint answers, the one login serves both and both tools
 * run. Nothing rejects unhandled.
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

it('R1 is sent a cancel while both wait in the connect: both run to their end on the one login', async () => {
  s.tokens.holdCodes(true);
  const r1 = s.call('r1');
  const r2 = s.call('r2');
  await s.tokens.codeArrived();
  // Both have their provider and wait in the one connect().
  await until(() => s.providersAnswered() === 2);
  await turns();
  expect(s.active()).toBe(2);

  r1.cancel();
  expect(await r1.done).toBe('cancelled');
  // R1 is still a live call while the endpoint holds the code.
  await turns(50);
  expect(s.active()).toBe(2);
  expect(s.tokens.grants).toEqual(['authorization_code']);

  s.tokens.releaseCodes();
  expect(await r2.done).toEqual({ text: 'r2', isError: false });
  await until(() => s.active() === 0);
  expect(s.reached('r1')).toBe(true);
  expect(s.reached('r2')).toBe(true);
  expect(s.logins).toEqual(['ok']);
  await turns();
  expect(unhandled).toEqual([]);
});
