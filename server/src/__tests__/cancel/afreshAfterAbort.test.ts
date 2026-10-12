/**
 * A later request starts afresh (D7, spec §5.3, §14.4.7): R1's browser login
 * is cancelled, which ends it — R1 was its only party. Inside the abort
 * abortWindow — the login ended, the connect waiting for it not yet failed; held
 * open here by holding the provider's refused `prepare()` — R2 arrives, gets
 * the same provider and joins the same `connect()`, which then fails
 * `interactive-login` `aborted`. R2's own signal is live, so its connect is
 * tried once more: a new login, which the user answers, and R2 gets its
 * answer.
 */

import {
  deferred,
  type Stand,
  stand,
  turns,
  until,
} from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;
let refused = deferred();
let abortWindow = deferred();

beforeEach(async () => {
  refused = deferred();
  abortWindow = deferred();
  s = await stand({
    auth: 'jwt',
    holdRefusedPrepare: async () => {
      refused.resolve();
      await abortWindow.promise;
    },
  });
});

afterEach(async () => {
  abortWindow.resolve();
  await s.close();
});

it('R2 inside the abort abortWindow of R1 logs in afresh', async () => {
  s.browser.answering(false);
  const r1 = s.call('r1');
  await s.browser.opened(1);
  r1.cancel();
  // R1's login ended aborted; the connect has not failed yet: the abortWindow.
  await refused.promise;
  await until(() => s.active() === 0 && s.logins.length === 1);
  expect(s.logins).toEqual(['aborted']);

  s.browser.answering(true);
  const r2 = s.call('r2');
  // R2 has its provider and waits in the connect() still ending.
  await until(() => s.providersAnswered() === 2);
  await turns();
  abortWindow.resolve();

  expect(await r2.done).toEqual({ text: 'r2', isError: false });
  expect(s.logins).toEqual(['aborted', 'ok']);
  expect(s.browser.ports).toHaveLength(2);
  expect(s.reached('r1')).toBe(false);
});
