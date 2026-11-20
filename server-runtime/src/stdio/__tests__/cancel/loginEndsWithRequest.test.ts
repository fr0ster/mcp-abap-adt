/**
 * stdio's login ends with the session: during a browser login
 * — auth-providers' real loopback strategy on port `0`, a fake browser that
 * does not answer — an MCP cancel aborts nothing (a tool call cannot be
 * cancelled): the login goes on, its port held. The session's end (the
 * client's transport closes) ends it `aborted`, and the callback port binds
 * afterwards.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { bindsFree, type Stand, stand, until } from '../helpers/loginStand';

let s: Stand;

beforeEach(async () => {
  s = await stand({ kind: 'cloud', auth: 'jwt' });
});

afterEach(async () => {
  await s.close();
});

it('a cancel during the login aborts nothing; the session’s end ends it aborted and frees the port', async () => {
  s.browser.answering(false);
  const r1 = s.call('r1');
  await s.browser.opened(1);
  r1.cancel();
  assert.equal(await r1.done, 'cancelled');

  // The login goes on: no outcome, the call live.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepStrictEqual(s.logins, []);
  assert.equal(s.active(), 1);

  await s.client.close();
  await until(() => s.logins.length === 1);
  assert.deepStrictEqual(s.logins, ['aborted']);
  await until(() => s.active() === 0);
  await bindsFree(s.browser.ports[0]);
  assert.deepStrictEqual(s.tokens.grants, []);
  assert.equal(s.reached('r1'), false);
});
