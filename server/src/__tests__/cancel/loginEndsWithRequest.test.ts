/**
 * stdio's login ends with its request (spec §14.4.9): an MCP cancel during a
 * browser login — auth-providers' real loopback strategy on port `0`, a fake
 * browser that does not answer — ends the login `aborted`; the callback port
 * binds afterwards; the next request logs in.
 */

import { bindsFree, type Stand, stand, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

beforeEach(async () => {
  s = await stand({ auth: 'jwt' });
});

afterEach(async () => {
  await s.close();
});

it('a cancel during the login ends it aborted, frees the port, and the next request logs in', async () => {
  s.browser.answering(false);
  const r1 = s.call('r1');
  await s.browser.opened(1);
  r1.cancel();

  await until(() => s.logins.length === 1);
  expect(s.logins).toEqual(['aborted']);
  await until(() => s.active() === 0);
  expect(await r1.done).toBe('cancelled');
  await bindsFree(s.browser.ports[0]);
  expect(s.tokens.grants).toEqual([]);

  s.browser.answering(true);
  expect(await s.call('r2').done).toEqual({ text: 'r2', isError: false });
  expect(s.logins).toEqual(['aborted', 'ok']);
  expect(s.tokens.grants).toEqual(['authorization_code']);
  expect(s.reached('r1')).toBe(false);
});
