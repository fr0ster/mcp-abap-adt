/**
 * A finished request's party is released: R1 logs
 * in and completes. Later, R2's request is refused by the system (`401`),
 * the refresh is refused, and the provider starts a login; then the session
 * ends (the client's transport closes; a cancel would abort nothing). No
 * party is left alive — R1's signal was aborted when R1 ended — so the
 * login ends `aborted`, R2's call settles, and the callback port is free.
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

it("after R1 completes, R2's login ends with the session", async () => {
  expect(await s.call('r1').done).toEqual({ text: 'r1', isError: false });
  expect(s.logins).toEqual(['ok']);
  expect(s.active()).toBe(0);

  s.adt.refuse(true);
  s.tokens.refuseRefresh(true);
  s.browser.answering(false);
  const r2 = s.call('r2');
  await s.browser.opened(2);
  await s.client.close();

  // The login ends with R2: nobody else holds it.
  await until(() => s.logins.length === 2, 5_000);
  expect(s.logins).toEqual(['ok', 'aborted']);
  await until(() => s.active() === 0, 5_000);
  await bindsFree(s.browser.ports[1]);
});
