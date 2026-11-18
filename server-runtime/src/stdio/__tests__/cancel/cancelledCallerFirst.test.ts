/**
 * A cancel aborts nothing (a tool call cannot be cancelled): two requests
 * wait in stdio's one shared `connect()` — a browser login whose code
 * exchange the token endpoint holds. R1 is sent a cancel: it stays a live
 * call; once the endpoint answers, the one login serves both and both tools
 * run. Nothing rejects unhandled.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

let s: Stand;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(async () => {
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
  s = await stand({ kind: 'cloud', auth: 'jwt' });
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
  assert.equal(s.active(), 2);

  r1.cancel();
  assert.equal(await r1.done, 'cancelled');
  // R1 is still a live call while the endpoint holds the code.
  await turns(50);
  assert.equal(s.active(), 2);
  assert.deepStrictEqual(s.tokens.grants, ['authorization_code']);

  s.tokens.releaseCodes();
  assert.deepStrictEqual(await r2.done, { text: 'r2', isError: false });
  await until(() => s.active() === 0);
  assert.equal(s.reached('r1'), true);
  assert.equal(s.reached('r2'), true);
  assert.deepStrictEqual(s.logins, ['ok']);
  await turns();
  assert.deepStrictEqual(unhandled, []);
});
