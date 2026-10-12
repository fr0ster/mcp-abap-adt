/**
 * A package can be saved only once per ABAP session (PAK/058, CL_PACKAGE's
 * instance buffer — on premise, 2026-09-26/27). A create over RFC and every lock
 * chain, on either transport, run in sessions of their own.
 */
const opened: Array<{
  connect: jest.Mock;
  disconnect: jest.Mock;
  getConfig: () => { connectionType: string };
  credential: unknown;
  settings: unknown;
}> = [];
let useRealFactory = false;
jest.mock('../../lib/connectionFactory', () => {
  const actual = jest.requireActual('../../lib/connectionFactory');
  return {
    ...actual,
    createAbapConnection: (settings: unknown, credential: unknown) => {
      if (useRealFactory) {
        return (actual.createAbapConnection as (...a: unknown[]) => unknown)(
          settings,
          credential,
        );
      }
      const fresh = {
        connect: jest.fn(async () => {}),
        disconnect: jest.fn(async () => {}),
        getConfig: () => ({ connectionType: 'rfc' }),
        credential,
        settings,
      };
      opened.push(fresh);
      return fresh;
    },
  };
});

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  connectionForPackageLock,
  connectionHoldingPackageLock,
  inOwnSessionOverRfc,
  openFreshConnection,
  registerFreshConnectionFactory,
  releasePackageLockSession,
} from '../../lib/packageSessions';

/** A connection whose host hands fresh ones over through a factory. */
const handedOver: typeof opened = [];
const connectionOf = (connectionType: string) => {
  const connection = { getConfig: () => ({ connectionType }) } as any;
  registerFreshConnectionFactory(connection, async () => {
    const fresh = {
      connect: jest.fn(async () => {}),
      disconnect: jest.fn(async () => {}),
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
    expect(used).toBe(caller);
    expect(handedOver).toHaveLength(0);
  });

  it('runs a create in a session of its own over RFC, and closes it', async () => {
    const caller = connectionOf('rfc');
    const used = await inOwnSessionOverRfc(
      caller,
      undefined,
      'x',
      async (c) => c,
    );
    expect(handedOver).toHaveLength(1);
    expect(used).toBe(handedOver[0]);
    expect(handedOver[0].connect).toHaveBeenCalled();
    expect(handedOver[0].disconnect).toHaveBeenCalled();
  });

  it('closes its own session over RFC when the work throws', async () => {
    await expect(
      inOwnSessionOverRfc(connectionOf('rfc'), undefined, 'x', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(handedOver[0].disconnect).toHaveBeenCalled();
  });

  it('keeps an RFC lock session under its handle until the unlock', async () => {
    const caller = connectionOf('rfc');
    const lockOn = await connectionForPackageLock(caller, undefined);
    expect(lockOn.connection).toBe(handedOver[0]);
    lockOn.keep('HANDLE1');

    expect(connectionHoldingPackageLock(caller, 'HANDLE1')).toBe(handedOver[0]);
    expect(handedOver[0].disconnect).not.toHaveBeenCalled();

    await releasePackageLockSession('HANDLE1', undefined);
    expect(handedOver[0].disconnect).toHaveBeenCalled();
    expect(connectionHoldingPackageLock(caller, 'HANDLE1')).toBe(caller);
  });

  it('closes an RFC lock session that took no lock', async () => {
    const lockOn = await connectionForPackageLock(
      connectionOf('rfc'),
      undefined,
    );
    await lockOn.drop();
    expect(handedOver[0].disconnect).toHaveBeenCalled();
  });

  it('locks on the caller connection over HTTP', async () => {
    // The connection keeps the lock's context to the stateful requests, so the
    // PUT on the same connection runs outside it (on two on-premise releases, 2026-09-27).
    const caller = connectionOf('http');
    const lockOn = await connectionForPackageLock(caller, undefined);
    expect(lockOn.connection).toBe(caller);
    lockOn.keep('HANDLE2');
    expect(connectionHoldingPackageLock(caller, 'HANDLE2')).toBe(caller);
    expect(handedOver).toHaveLength(0);
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

  it('opens a sibling holding the same credential object and the same settings', async () => {
    const { createAbapConnection } = jest.requireActual(
      '../../lib/connectionFactory',
    ) as typeof import('../../lib/connectionFactory');
    const credential = new BasicAuthProvider('user', 'secret');
    const settings = {
      url: 'https://sap.example.invalid',
      client: '000',
      authType: 'basic' as const,
    };
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    useRealFactory = true;
    const original = createAbapConnection(settings, credential) as any;
    const connect = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(original)), 'connect')
      .mockResolvedValue(undefined);

    const fresh = (await openFreshConnection(original, undefined)) as any;

    expect(fresh).not.toBe(original);
    expect(fresh.credential).toBe(credential);
    expect(fresh.getConfig()).toEqual(settings);
    expect(connect).toHaveBeenCalled();
    connect.mockRestore();
  });

  it('closes a sibling whose connect fails, and answers the failure', async () => {
    const { createAbapConnection } = jest.requireActual(
      '../../lib/connectionFactory',
    ) as typeof import('../../lib/connectionFactory');
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
    const connect = jest
      .spyOn(ownerOf('connect'), 'connect')
      .mockRejectedValue(refusal);
    const closed: unknown[] = [];
    const disconnect = jest
      .spyOn(ownerOf('disconnect'), 'disconnect')
      .mockImplementation(async function (this: unknown) {
        closed.push(this);
      });

    try {
      const failed = expect(
        openFreshConnection(original, undefined),
      ).rejects.toBe(refusal);
      await failed;
      expect(connect).toHaveBeenCalledTimes(1);
      expect(closed).toHaveLength(1);
      expect(closed[0]).not.toBe(original);
    } finally {
      connect.mockRestore();
      disconnect.mockRestore();
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

    const refused = expect(
      openFreshConnection(foreign, undefined),
    ).rejects.toMatchObject({
      serverRefusal: 'fresh_connection_unavailable',
    });
    await refused;

    expect(opened).toHaveLength(0);
  });

  it('takes a host’s connection from its factory, connects it, and builds nothing', async () => {
    opened.length = 0;
    const foreign = { getConfig: () => ({ connectionType: 'rfc' }) } as any;
    const handed = {
      connect: jest.fn(async () => {}),
      disconnect: jest.fn(async () => {}),
    };
    const factory = jest.fn(async () => handed as any);
    registerFreshConnectionFactory(foreign, factory);

    const fresh = await openFreshConnection(foreign, undefined);

    expect(fresh).toBe(handed);
    expect(handed.connect).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ signal: undefined });
    expect(opened).toHaveLength(0);
  });

  it('forgets a host’s factory when the connection is registered again without one', async () => {
    const foreign = {} as any;
    const factory = jest.fn(async () => ({}) as any);
    registerFreshConnectionFactory(foreign, factory);
    registerFreshConnectionFactory(foreign, undefined);

    const refused = expect(
      openFreshConnection(foreign, undefined),
    ).rejects.toMatchObject({
      serverRefusal: 'fresh_connection_unavailable',
    });
    await refused;
    expect(factory).not.toHaveBeenCalled();
  });
});
