/**
 * stdio, after the start: the shutdown, and the session's end, while a
 * connection is still in its `connect()` behind a browser login —
 * auth-providers' real loopback strategy on port `0`, the repo's fake
 * browser that never answers. The connection is owned, so its logoff is
 * queued behind that connect (connection 17), and the connect waits for the
 * login. After the start every connect runs under a call, and the logoffs at
 * once interrupt every call (`interrupt()`, the instance close
 * `interrupt(instance)`): the call's signal was the login's one party, so
 * the login ends `aborted` beside the logoffs, not after them. On stdin's
 * `end` / `close` (the client closed the session) and on `SIGTERM`: exit 0
 * once, no line — the shutdown ends as after any start —, nothing left
 * owned, the callback port binds again. Both the instance's own connection
 * logging on in its first call and a long read's fresh connection.
 */

import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { format } from 'node:util';
import {
  assertMatchObject,
  rejectionOf,
} from '../../../../../src/__tests__/helpers/assertions';
import { longReadUrl } from '../../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../../src/lib/ownedConnections';
import { bindsFree, type Stand, stand, until } from '../helpers/loginStand';

let s: Stand;

afterEach(async () => {
  await s.close();
});

const triggers: [string, (st: Stand) => void][] = [
  ['stdin end', (st) => st.processLike.stdin.emit('end')],
  ['stdin close', (st) => st.processLike.stdin.emit('close')],
  ['SIGTERM', (st) => st.processLike.emit('SIGTERM')],
];

for (const [_name, trigger] of triggers) {
  it(
    format(
      '%s while a connect waits for its browser login: the login ends aborted, exit 0 once, nothing owned, the callback port free',
      _name,
    ),
    async () => {
      s = await stand({ kind: 'cloud', auth: 'jwt', shutdown: {} });
      s.browser.answering(false);
      const r1 = s.call('r1');
      // The connect is in its login: the browser was given its URL, the
      // callback listens, the connection is owned.
      await s.browser.opened(1);
      const port = s.browser.ports[0] ?? 0;
      assert.ok(port > 0);
      assertMatchObject(await rejectionOf(bindsFree(port)), {
        code: 'EADDRINUSE',
      });
      assert.equal(ownedConnections().length, 1);

      trigger(s);
      // The test's own bound: no runner timeout exists, so without it a hang
      // would simply hang; with it, a hang reads as `hung`.
      let bound: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        s.exited,
        new Promise<'hung'>((r) => {
          bound = setTimeout(() => r('hung'), 10_000);
        }),
      ]);
      clearTimeout(bound);
      assert.equal(outcome, 0);
      // Long enough for a second exit, were there one, to be recorded.
      await new Promise((r) => setTimeout(r, 50));
      assert.deepStrictEqual(s.exits, [0]);
      assert.deepStrictEqual(s.shutdownLines, []);
      await until(() => s.logins.length === 1);
      assert.deepStrictEqual(s.logins, ['aborted']);
      assert.deepStrictEqual(ownedConnections(), []);
      assert.deepStrictEqual(s.tokens.grants, []);
      assert.equal(s.reached('r1'), false);
      assert.notDeepStrictEqual(await r1.done, { text: 'r1', isError: false });
      // The login ended with the shutdown: its callback port binds again.
      await bindsFree(port);
    },
  );
}

for (const [_name, trigger] of triggers) {
  it(
    format(
      "%s while a long read's fresh connection waits in its connect for a browser login: the login ends aborted, exit 0 once, nothing owned, the callback port free",
      _name,
    ),
    async () => {
      s = await stand({ kind: 'cloud', auth: 'jwt', shutdown: {} });
      // The instance's connection logs on: the user answers the first login.
      assert.deepStrictEqual(await s.call('r0').done, {
        text: 'r0',
        isError: false,
      });
      assert.deepStrictEqual(s.logins, ['ok']);
      // From now on SAP refuses the token, the refresh is refused, and the
      // user never answers the second login: the fresh connection's connect
      // waits on it.
      s.browser.answering(false);
      s.tokens.refuseRefresh(true);
      s.adt.refuse(true);
      const running = s.callTool('LongRead', { id: 'L' });
      await s.browser.opened(2);
      const port = s.browser.ports[1] ?? 0;
      assert.ok(port > 0);
      assertMatchObject(await rejectionOf(bindsFree(port)), {
        code: 'EADDRINUSE',
      });
      assert.equal(ownedConnections().length, 2);
      assert.equal(
        s.adt.requests.some((r) => r.url.startsWith(longReadUrl('L'))),
        false,
      );

      trigger(s);
      let bound: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        s.exited,
        new Promise<'hung'>((r) => {
          bound = setTimeout(() => r('hung'), 10_000);
        }),
      ]);
      clearTimeout(bound);
      assert.equal(outcome, 0);
      await new Promise((r) => setTimeout(r, 50));
      assert.deepStrictEqual(s.exits, [0]);
      assert.deepStrictEqual(s.shutdownLines, []);
      await until(() => s.logins.length === 2);
      assert.deepStrictEqual(s.logins, ['ok', 'aborted']);
      assert.deepStrictEqual(ownedConnections(), []);
      assert.notDeepStrictEqual(await running, { text: 'L', isError: false });
      assert.equal(
        s.adt.requests.some((r) => r.url.startsWith(longReadUrl('L'))),
        false,
      );
      await bindsFree(port);
    },
  );
}

it("the client's transport close (the session's end) while a long read's fresh connection waits in its connect for a browser login: the login ends aborted, nothing owned, the callback port free", async () => {
  s = await stand({ kind: 'cloud', auth: 'jwt', shutdown: {} });
  assert.deepStrictEqual(await s.call('r0').done, {
    text: 'r0',
    isError: false,
  });
  s.browser.answering(false);
  s.tokens.refuseRefresh(true);
  s.adt.refuse(true);
  const running = s.callTool('LongRead', { id: 'L' });
  await s.browser.opened(2);
  const port = s.browser.ports[1] ?? 0;
  assert.ok(port > 0);
  assert.equal(ownedConnections().length, 2);

  await s.client.close();
  await until(() => s.logins.length === 2);
  assert.deepStrictEqual(s.logins, ['ok', 'aborted']);
  await until(() => s.active() === 0);
  assert.deepStrictEqual(ownedConnections(), []);
  assert.notDeepStrictEqual(await running, { text: 'L', isError: false });
  assert.equal(
    s.adt.requests.some((r) => r.url.startsWith(longReadUrl('L'))),
    false,
  );
  // The session's end is not the process's: no exit.
  assert.deepStrictEqual(s.exits, []);
  await bindsFree(port);
});
