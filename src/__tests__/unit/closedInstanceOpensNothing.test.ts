/**
 * A closed instance opens and owns no new connection (spec §6.4): once its
 * latch is set — its close (`closeInstance`) or the process's shutdown
 * (`latch()`) — the terminal close has swept what it owned, so a running
 * tool's next step that would open a fresh connection is refused
 * (`ClosedInstanceRefusal`, answered as the shutdown refusal) before anything
 * is built or sent: the host's factory is not called, nothing is connected,
 * nothing is owned. A latch that closes while the factory or the connect
 * runs ends that connection (its one logoff) and refuses the same way.
 * Another instance is untouched.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  latch,
  resetProcessLatchForTests,
  shutdownRefusal,
} from '../../lib/activeTools';
import {
  ClosedInstanceRefusal,
  failureOf,
  INSTANCE_CLOSED_WORDS,
  isClosedInstanceRefusal,
} from '../../lib/auth/failures';
import { closeInstance } from '../../lib/instanceClose';
import {
  own,
  ownedConnections,
  refuseIfClosed,
  runAsOwner,
} from '../../lib/ownedConnections';
import {
  openFreshConnection,
  registerFreshConnectionFactory,
} from '../../lib/packageSessions';

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

interface Fake {
  connects: number;
  logoffs: number;
  connection: IAbapConnection;
  /** Resolves a held `connect()`. */
  connected: () => void;
}

function fake(holdConnect = false, rejectAfterHold = false): Fake {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const self: Fake = {
    connects: 0,
    logoffs: 0,
    connected: () => release(),
    connection: {} as IAbapConnection,
  };
  self.connection = {
    connect: async () => {
      self.connects += 1;
      if (holdConnect) await held;
      if (rejectAfterHold) throw new Error('connect abandoned');
    },
    disconnect: async () => {
      self.logoffs += 1;
    },
  } as unknown as IAbapConnection;
  return self;
}

function closable() {
  return { letGoOfState: () => {}, close: async () => {} };
}

/** An injected main connection whose host's factory hands out `fresh`. */
function injected(make: () => Promise<IAbapConnection>) {
  const main = {} as IAbapConnection;
  const calls = { count: 0 };
  registerFreshConnectionFactory(main, async () => {
    calls.count += 1;
    return make();
  });
  return { main, calls };
}

beforeEach(() => resetProcessLatchForTests());
afterAll(() => resetProcessLatchForTests());

it('after the instance close: refused before the factory is called, nothing owned; answered as instance_closed', async () => {
  const instance = closable();
  const fresh = fake();
  const { main, calls } = injected(async () => fresh.connection);
  await closeInstance(instance);

  let thrown: unknown;
  await runAsOwner(instance, async () => {
    try {
      await openFreshConnection(main, undefined);
    } catch (error) {
      thrown = error;
    }
  });
  expect(isClosedInstanceRefusal(thrown)).toBe(true);
  expect(calls.count).toBe(0);
  expect(fresh.connects).toBe(0);
  expect(ownedConnections(instance)).toEqual([]);
  // The server keeps running: its own refusal, not the shutdown's.
  expect(failureOf(thrown)).toEqual({
    error: 'instance_closed',
    message: INSTANCE_CLOSED_WORDS,
  });
  // Forged: the same name and message are not the refusal.
  expect(
    isClosedInstanceRefusal(Object.assign(new Error(''), { name: 'x' })),
  ).toBe(false);
});

it('after the process latch: refused, outside a call and inside one', async () => {
  const instance = closable();
  const fresh = fake();
  const { main, calls } = injected(async () => fresh.connection);
  latch();
  expect(() => refuseIfClosed()).toThrow(ClosedInstanceRefusal);
  // A real shutdown keeps the shutdown refusal.
  let thrown: unknown;
  try {
    refuseIfClosed();
  } catch (error) {
    thrown = error;
  }
  expect(failureOf(thrown)).toEqual(shutdownRefusal());
  await expect(
    runAsOwner(instance, () => openFreshConnection(main, undefined)),
  ).rejects.toBeInstanceOf(ClosedInstanceRefusal);
  expect(calls.count).toBe(0);
  expect(ownedConnections()).toEqual([]);
});

it('the close comes while the factory runs: the handed connection is logged off, never connected, never owned', async () => {
  const instance = closable();
  const fresh = fake();
  let hand: () => void = () => {};
  const handed = new Promise<void>((resolve) => {
    hand = resolve;
  });
  const { main, calls } = injected(async () => {
    await handed;
    return fresh.connection;
  });
  const opening = runAsOwner(instance, () =>
    openFreshConnection(main, undefined),
  );
  const refused = expect(opening).rejects.toBeInstanceOf(ClosedInstanceRefusal);
  await turns();
  expect(calls.count).toBe(1);
  await closeInstance(instance);
  hand();
  await refused;
  expect(fresh.connects).toBe(0);
  expect(fresh.logoffs).toBe(1);
  expect(ownedConnections(instance)).toEqual([]);
});

it('the close comes while the connect runs: swept with the rest, one logoff, the caller refused once it settles', async () => {
  const instance = closable();
  const fresh = fake(true);
  const { main } = injected(async () => fresh.connection);
  const opening = runAsOwner(instance, () =>
    openFreshConnection(main, undefined),
  );
  const refused = expect(opening).rejects.toBeInstanceOf(ClosedInstanceRefusal);
  await turns();
  expect(fresh.connects).toBe(1);
  expect(ownedConnections(instance)).toEqual([fresh.connection]);
  await closeInstance(instance);
  expect(fresh.logoffs).toBe(1);
  fresh.connected();
  await refused;
  // Joined, never a second `disconnect()`.
  expect(fresh.logoffs).toBe(1);
  expect(ownedConnections(instance)).toEqual([]);
});

it('the close comes while the connect runs and the connect then REJECTS (connection 17 abandons it): the caller gets the refusal, not the connect error; one logoff', async () => {
  const instance = closable();
  const fresh = fake(true, true);
  const { main } = injected(async () => fresh.connection);
  const opening = runAsOwner(instance, () =>
    openFreshConnection(main, undefined),
  );
  const refused = expect(opening).rejects.toBeInstanceOf(ClosedInstanceRefusal);
  await turns();
  expect(fresh.connects).toBe(1);
  await closeInstance(instance);
  fresh.connected();
  await refused;
  expect(fresh.logoffs).toBe(1);
  expect(ownedConnections(instance)).toEqual([]);
});

it('own() of a new connection for a closed instance: ended at once and refused', async () => {
  const instance = closable();
  const late = fake();
  await closeInstance(instance);
  expect(() =>
    own(late.connection, { owner: instance, role: 'state' }),
  ).toThrow(ClosedInstanceRefusal);
  await turns();
  expect(late.logoffs).toBe(1);
  expect(ownedConnections(instance)).toEqual([]);
});

it('another instance still opens its fresh connection', async () => {
  const closed = closable();
  const open = closable();
  const fresh = fake();
  const { main } = injected(async () => fresh.connection);
  await closeInstance(closed);
  const got = await runAsOwner(open, () =>
    openFreshConnection(main, undefined),
  );
  expect(got).toBe(fresh.connection);
  expect(fresh.connects).toBe(1);
  expect(ownedConnections(open)).toEqual([fresh.connection]);
});
