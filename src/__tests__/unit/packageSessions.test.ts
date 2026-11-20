/**
 * A package can be saved only once per ABAP session (PAK/058, CL_PACKAGE's
 * instance buffer — on premise, 2026-09-26/27). A create over RFC and every lock
 * chain, on either transport, run in sessions of their own.
 */
import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import * as connectionFactory from '../../lib/connectionFactory';
import {
  connectionForPackageLock,
  connectionHoldingPackageLock,
  inOwnSessionOverRfc,
  openFreshConnection,
  registerFreshConnectionFactory,
  releasePackageLockSession,
} from '../../lib/packageSessions';
import {
  assertMatchObject,
  assertRejects,
  rejectionOf,
} from '../helpers/assertions';

const opened: Array<{
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
  getConfig: () => { connectionType: string };
  credential: unknown;
  settings: unknown;
}> = [];
let useRealFactory = false;

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// The real exports, read before any is replaced.
const actual = { ...connectionFactory };

mock.method(
  connectionFactory,
  'createAbapConnection',
  (settings: unknown, credential: unknown) => {
    if (useRealFactory) {
      return (actual.createAbapConnection as (...a: unknown[]) => unknown)(
        settings,
        credential,
      );
    }
    const fresh = {
      connect: mock.fn(async () => {}),
      disconnect: mock.fn(async () => {}),
      getConfig: () => ({ connectionType: 'rfc' }),
      credential,
      settings,
    };
    opened.push(fresh);
    return fresh;
  },
);

/** A connection whose host hands fresh ones over through a factory. */
const handedOver: typeof opened = [];
const connectionOf = (connectionType: string) => {
  const connection = { getConfig: () => ({ connectionType }) } as any;
  registerFreshConnectionFactory(connection, async () => {
    const fresh = {
      connect: mock.fn(async () => {}),
      disconnect: mock.fn(async () => {}),
      getConfig: () => ({ connectionType }),
      credential: undefined,
      settings: undefined,
    };
    handedOver.push(fresh);
    return fresh as any;
  });
  return connection;
};

describe('package sessions', () => {
  beforeEach(() => {
    opened.length = 0;
    handedOver.length = 0;
  });

  it('runs a create on the caller connection over HTTP', async () => {
    const caller = connectionOf('http');
    const used = await inOwnSessionOverRfc(
      caller,
      undefined,
      'x',
      async (c) => c,
    );
    assert.equal(used, caller);
    assert.equal(handedOver.length, 0);
  });

  it('runs a create in a session of its own over RFC, and closes it', async () => {
    const caller = connectionOf('rfc');
    const used = await inOwnSessionOverRfc(
      caller,
      undefined,
      'x',
      async (c) => c,
    );
    assert.equal(handedOver.length, 1);
    assert.equal(used, handedOver[0]);
    assert.ok(handedOver[0].connect.mock.callCount() > 0);
    assert.ok(handedOver[0].disconnect.mock.callCount() > 0);
  });

  it('closes its own session over RFC when the work throws', async () => {
    await assertRejects(
      inOwnSessionOverRfc(connectionOf('rfc'), undefined, 'x', async () => {
        throw new Error('boom');
      }),
      'boom',
    );
    assert.ok(handedOver[0].disconnect.mock.callCount() > 0);
  });

  it('keeps an RFC lock session under its handle until the unlock', async () => {
    const caller = connectionOf('rfc');
    const lockOn = await connectionForPackageLock(caller, undefined);
    assert.equal(lockOn.connection, handedOver[0]);
    lockOn.keep('HANDLE1');

    assert.equal(
      connectionHoldingPackageLock(caller, 'HANDLE1'),
      handedOver[0],
    );
    assert.equal(handedOver[0].disconnect.mock.callCount(), 0);

    await releasePackageLockSession('HANDLE1', undefined);
    assert.ok(handedOver[0].disconnect.mock.callCount() > 0);
    assert.equal(connectionHoldingPackageLock(caller, 'HANDLE1'), caller);
  });

  it('closes an RFC lock session that took no lock', async () => {
    const lockOn = await connectionForPackageLock(
      connectionOf('rfc'),
      undefined,
    );
    await lockOn.drop();
    assert.ok(handedOver[0].disconnect.mock.callCount() > 0);
  });

  it('locks on the caller connection over HTTP', async () => {
    // The connection keeps the lock's context to the stateful requests, so the
    // PUT on the same connection runs outside it (on two on-premise releases, 2026-09-27).
    const caller = connectionOf('http');
    const lockOn = await connectionForPackageLock(caller, undefined);
    assert.equal(lockOn.connection, caller);
    lockOn.keep('HANDLE2');
    assert.equal(connectionHoldingPackageLock(caller, 'HANDLE2'), caller);
    assert.equal(handedOver.length, 0);
  });
});

/**
 * A fresh session is opened from the record the factory kept for the
 * connection it built: the same settings and the same credential object.
 */
describe('openFreshConnection', () => {
  afterEach(() => {
    useRealFactory = false;
    delete process.env.SAP_SYSTEM_TYPE;
  });

  it('opens a sibling holding the same credential object and the same settings', async (t) => {
    const { createAbapConnection } = actual;
    const credential = new BasicAuthProvider('user', 'secret');
    const settings = {
      url: 'https://sap.example.invalid',
      client: '000',
      authType: 'basic' as const,
    };
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    useRealFactory = true;
    const original = createAbapConnection(settings, credential) as any;
    const connect = t.mock.method(
      Object.getPrototypeOf(Object.getPrototypeOf(original)),
      'connect',
      async () => undefined,
    );

    const fresh = (await openFreshConnection(original, undefined)) as any;

    assert.notEqual(fresh, original);
    assert.equal(fresh.credential, credential);
    assert.deepStrictEqual(fresh.getConfig(), settings);
    assert.ok(connect.mock.callCount() > 0);
    connect.mock.restore();
  });

  it('closes a sibling whose connect fails, and answers the failure', async (t) => {
    const { createAbapConnection } = actual;
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    useRealFactory = true;
    const original = createAbapConnection(
      {
        url: 'https://sap.example.invalid',
        client: '000',
        authType: 'basic' as const,
      },
      new BasicAuthProvider('user', 'secret'),
    ) as any;
    /** The prototype that owns `name`, on the connection's chain. */
    const ownerOf = (name: string) => {
      let proto = Object.getPrototypeOf(original);
      while (proto && !Object.hasOwn(proto, name)) {
        proto = Object.getPrototypeOf(proto);
      }
      return proto;
    };
    const refusal = new Error('the logon failed');
    const connect = t.mock.method(ownerOf('connect'), 'connect', async () => {
      throw refusal;
    });
    const closed: unknown[] = [];
    const disconnect = t.mock.method(
      ownerOf('disconnect'),
      'disconnect',
      async function (this: unknown) {
        closed.push(this);
      },
    );

    try {
      const failed = rejectionOf(openFreshConnection(original, undefined));
      assert.equal(await failed, refusal);
      assert.equal(connect.mock.callCount(), 1);
      assert.equal(closed.length, 1);
      assert.notEqual(closed[0], original);
    } finally {
      connect.mock.restore();
      disconnect.mock.restore();
    }
  });

  it('never opens one from the configuration of a connection the factory did not build', async () => {
    opened.length = 0;
    const config = {
      url: 'https://sap.example.invalid',
      client: '000',
      authType: 'basic',
      username: 'u',
      password: 'p',
    };
    const foreign = { getConfig: () => config, config } as any;

    const refused = rejectionOf(openFreshConnection(foreign, undefined));
    assertMatchObject(await refused, {
      serverRefusal: 'fresh_connection_unavailable',
    });

    assert.equal(opened.length, 0);
  });

  it('takes a host’s connection from its factory, connects it, and builds nothing', async () => {
    opened.length = 0;
    const foreign = { getConfig: () => ({ connectionType: 'rfc' }) } as any;
    const handed = {
      connect: mock.fn(async () => {}),
      disconnect: mock.fn(async () => {}),
    };
    const factory = mock.fn(async () => handed as any);
    registerFreshConnectionFactory(foreign, factory);

    const fresh = await openFreshConnection(foreign, undefined);

    assert.equal(fresh, handed);
    assert.equal(handed.connect.mock.callCount(), 1);
    assert.ok(
      factory.mock.calls.some((c) => isDeepStrictEqual(c.arguments, [])),
    );
    assert.equal(opened.length, 0);
  });

  it('forgets a host’s factory when the connection is registered again without one', async () => {
    const foreign = {} as any;
    const factory = mock.fn(async () => ({}) as any);
    registerFreshConnectionFactory(foreign, factory);
    registerFreshConnectionFactory(foreign, undefined);

    const refused = rejectionOf(openFreshConnection(foreign, undefined));
    assertMatchObject(await refused, {
      serverRefusal: 'fresh_connection_unavailable',
    });
    assert.equal(factory.mock.callCount(), 0);
  });
});
