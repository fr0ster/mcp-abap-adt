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

import { longReadUrl } from '../../../../src/__tests__/helpers/shutdownTools';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { bindsFree, type Stand, stand, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
});

const triggers: [string, (st: Stand) => void][] = [
  ['stdin end', (st) => st.processLike.stdin.emit('end')],
  ['stdin close', (st) => st.processLike.stdin.emit('close')],
  ['SIGTERM', (st) => st.processLike.emit('SIGTERM')],
];

it.each(triggers)(
  '%s while a connect waits for its browser login: the login ends aborted, exit 0 once, nothing owned, the callback port free',
  async (_name, trigger) => {
    s = await stand({ auth: 'jwt', shutdown: {} });
    s.browser.answering(false);
    const r1 = s.call('r1');
    // The connect is in its login: the browser was given its URL, the
    // callback listens, the connection is owned.
    await s.browser.opened(1);
    const port = s.browser.ports[0] ?? 0;
    expect(port).toBeGreaterThan(0);
    await expect(bindsFree(port)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(ownedConnections()).toHaveLength(1);

    trigger(s);
    // The test's own bound: a hang reads as `hung`, not as a Jest timeout.
    let bound: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      s.exited,
      new Promise<'hung'>((r) => {
        bound = setTimeout(() => r('hung'), 10_000);
      }),
    ]);
    clearTimeout(bound);
    expect(outcome).toBe(0);
    // Long enough for a second exit, were there one, to be recorded.
    await new Promise((r) => setTimeout(r, 50));
    expect(s.exits).toEqual([0]);
    expect(s.shutdownLines).toEqual([]);
    await until(() => s.logins.length === 1);
    expect(s.logins).toEqual(['aborted']);
    expect(ownedConnections()).toEqual([]);
    expect(s.tokens.grants).toEqual([]);
    expect(s.reached('r1')).toBe(false);
    expect(await r1.done).not.toEqual({ text: 'r1', isError: false });
    // The login ended with the shutdown: its callback port binds again.
    await bindsFree(port);
  },
);

it.each(triggers)(
  "%s while a long read's fresh connection waits in its connect for a browser login: the login ends aborted, exit 0 once, nothing owned, the callback port free",
  async (_name, trigger) => {
    s = await stand({ auth: 'jwt', shutdown: {} });
    // The instance's connection logs on: the user answers the first login.
    expect(await s.call('r0').done).toEqual({ text: 'r0', isError: false });
    expect(s.logins).toEqual(['ok']);
    // From now on SAP refuses the token, the refresh is refused, and the
    // user never answers the second login: the fresh connection's connect
    // waits on it.
    s.browser.answering(false);
    s.tokens.refuseRefresh(true);
    s.adt.refuse(true);
    const running = s.callTool('LongRead', { id: 'L' });
    await s.browser.opened(2);
    const port = s.browser.ports[1] ?? 0;
    expect(port).toBeGreaterThan(0);
    await expect(bindsFree(port)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(ownedConnections()).toHaveLength(2);
    expect(s.adt.requests.some((r) => r.url.startsWith(longReadUrl('L')))).toBe(
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
    expect(outcome).toBe(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(s.exits).toEqual([0]);
    expect(s.shutdownLines).toEqual([]);
    await until(() => s.logins.length === 2);
    expect(s.logins).toEqual(['ok', 'aborted']);
    expect(ownedConnections()).toEqual([]);
    expect(await running).not.toEqual({ text: 'L', isError: false });
    expect(s.adt.requests.some((r) => r.url.startsWith(longReadUrl('L')))).toBe(
      false,
    );
    await bindsFree(port);
  },
);

it("the client's transport close (the session's end) while a long read's fresh connection waits in its connect for a browser login: the login ends aborted, nothing owned, the callback port free", async () => {
  s = await stand({ auth: 'jwt', shutdown: {} });
  expect(await s.call('r0').done).toEqual({ text: 'r0', isError: false });
  s.browser.answering(false);
  s.tokens.refuseRefresh(true);
  s.adt.refuse(true);
  const running = s.callTool('LongRead', { id: 'L' });
  await s.browser.opened(2);
  const port = s.browser.ports[1] ?? 0;
  expect(port).toBeGreaterThan(0);
  expect(ownedConnections()).toHaveLength(2);

  await s.client.close();
  await until(() => s.logins.length === 2);
  expect(s.logins).toEqual(['ok', 'aborted']);
  await until(() => s.active() === 0);
  expect(ownedConnections()).toEqual([]);
  expect(await running).not.toEqual({ text: 'L', isError: false });
  expect(s.adt.requests.some((r) => r.url.startsWith(longReadUrl('L')))).toBe(
    false,
  );
  // The session's end is not the process's: no exit.
  expect(s.exits).toEqual([]);
  await bindsFree(port);
});
