/**
 * stdio's login ends with the session: during a browser login
 * — auth-providers' real loopback strategy on port `0`, a fake browser that
 * does not answer — an MCP cancel aborts nothing (a tool call cannot be
 * cancelled): the login goes on, its port held. The session's end (the
 * client's transport closes) ends it `aborted`, and the callback port binds
 * afterwards.
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

it('a cancel during the login aborts nothing; the session’s end ends it aborted and frees the port', async () => {
  s.browser.answering(false);
  const r1 = s.call('r1');
  await s.browser.opened(1);
  r1.cancel();
  expect(await r1.done).toBe('cancelled');

  // The login goes on: no outcome, the call live.
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(s.logins).toEqual([]);
  expect(s.active()).toBe(1);

  await s.client.close();
  await until(() => s.logins.length === 1);
  expect(s.logins).toEqual(['aborted']);
  await until(() => s.active() === 0);
  await bindsFree(s.browser.ports[0]);
  expect(s.tokens.grants).toEqual([]);
  expect(s.reached('r1')).toBe(false);
});
