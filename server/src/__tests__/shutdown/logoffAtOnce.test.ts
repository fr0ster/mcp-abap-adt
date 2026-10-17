/**
 * stdio, the client's close and the process shutdown: on stdin's
 * `end` (the client closed the transport) and on `SIGTERM`, the logoff of
 * every connection the instance owns — its connector, held state's, a long
 * read's own — is written at once, while a tool's request is still held at
 * the stand-in; a call queued behind it never sends; the process exits
 * without waiting for the tool, and the tool's later request (its `UNLOCK`)
 * never reaches the system: the logoff released the lock. A tool whose
 * main-connection request SAP answers after the logoffs opens no fresh
 * connection: no second logon, nothing left owned.
 */

import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
  listenUrl,
  longReadUrl,
  mainReadUrl,
} from '../../../../src/__tests__/helpers/shutdownTools';
import * as connectionFactory from '../../../../src/lib/connectionFactory';
import { ownedConnections } from '../../../../src/lib/ownedConnections';
import { type Stand, stand, turns, until } from '../helpers/loginStand';

jest.setTimeout(30_000);

let s: Stand;

afterEach(async () => {
  await s.close();
});

const triggers: [string, (st: Stand) => void][] = [
  ['stdin end', (st) => st.processLike.stdin.emit('end')],
  ['SIGTERM', (st) => st.processLike.emit('SIGTERM')],
];

const connects = () =>
  s.adt.requests.filter((r) => r.url.includes('discovery')).length;

it.each(triggers)(
  '%s: the connector and the state are logged off under the held update; the queued call never sends; exit 0 before the tool settles; no UNLOCK',
  async (_name, trigger) => {
    s = await stand({ shutdown: {} });
    expect(await s.callTool('HoldState', { id: 'S' })).toMatchObject({
      isError: false,
    });
    const hold = s.adt.hold((r) => isUpdateOf('A')(r.url));
    const running = s.callTool('LockedUpdate', { id: 'A' });
    await hold.arrived;
    const queued = s.callTool('LockedUpdate', { id: 'B' });
    await turns(10);

    trigger(s);
    // The connector's and the state's logoffs reach the system while the
    // update is still held: nothing waited for the tool.
    await until(() => s.adt.logoffs() === 2);
    expect(await s.exited).toBe(0);
    // The tool still runs (its update held): the exit did not wait for it.
    expect(s.active()).toBeGreaterThan(0);
    expect(ownedConnections()).toEqual([]);
    expect(s.adt.logoffs()).toBe(connects());

    // The client's transport closed with the server: no answer is read.
    expect(await running).toBe('cancelled');
    // The queued call left the main flow without reaching its tool.
    expect(await queued).not.toEqual({ text: 'B', isError: false });
    hold.release();
    await until(() => s.active() === 0);
    await turns(20);
    expect(s.adt.requests.some((r) => isLockOf('B')(r.url))).toBe(false);
    expect(s.adt.requests.some((r) => isUnlockOf('A')(r.url))).toBe(false);
    expect(s.shutdownLines).toEqual([]);
    // The shutdown's logoffs and the transport's close are one close: one
    // logoff per connection, after everything settled.
    expect(s.adt.logoffs()).toBe(connects());
  },
);

it.each(triggers)(
  "%s: a long read's own connection is logged off under its held read",
  async (_name, trigger) => {
    s = await stand({ shutdown: {} });
    const hold = s.adt.hold((r) => r.url.startsWith(longReadUrl('L')));
    const running = s.callTool('LongRead', { id: 'L' });
    await hold.arrived;
    const session = s.adt.requests.find((r) =>
      r.url.startsWith(longReadUrl('L')),
    )?.session;
    expect(session).toBeDefined();

    trigger(s);
    await until(() =>
      s.adt.requests.some((r) => isLogoff(r.url) && r.session === session),
    );
    expect(await s.exited).toBe(0);
    expect(s.active()).toBe(1);
    // The connector too: every connection of the instance.
    await until(() => s.adt.logoffs() === connects());
    expect(await running).toBe('cancelled');
    hold.release();
    await until(() => s.active() === 0);
  },
);

it.each(triggers)(
  "%s: SAP answers the tool's main-connection request after the logoffs: its next step opens no fresh connection — no second logon, nothing owned",
  async (_name, trigger) => {
    s = await stand({ shutdown: {} });
    const hold = s.adt.hold((r) => r.url.startsWith(mainReadUrl('M')));
    const running = s.callTool('MainThenFresh', { id: 'M' });
    await hold.arrived;
    expect(connects()).toBe(1);

    trigger(s);
    await until(() => s.adt.logoffs() === 1);
    expect(await s.exited).toBe(0);
    const built = jest.spyOn(connectionFactory, 'createAbapConnection');
    // SAP answers the held request: the tool goes on to its fresh connection.
    hold.release();
    await until(() => s.active() === 0);
    await turns(20);
    // Refused before anything is built — the provider's closed gate is not
    // what stopped it.
    expect(built).not.toHaveBeenCalled();
    built.mockRestore();
    expect(connects()).toBe(1);
    expect(s.adt.requests.some((r) => r.url.startsWith(listenUrl('M')))).toBe(
      false,
    );
    expect(ownedConnections()).toEqual([]);
    expect(s.adt.logoffs()).toBe(connects());
    expect(await running).toBe('cancelled');
  },
);
