/**
 * Every owned connection ends with `disconnect()` (the sweep):
 * one case per end in `tools/connection-ends.json`, on recording
 * connections, asserting `disconnect()` was called exactly once — on
 * success and on failure for the fresh connections — and never for an
 * injected connection. connection 16 refuses a second `disconnect()`
 * (`NOT_CONNECTED`), so every end joins the first.
 *
 * The ends that are a transport's — an instance's connections at the pool's
 * disposal, an SSE close, shutdown — run against the ADT stand-in in
 * `unit/shutdown/lockHeldLogoff.test.ts`, `undoFailsLogoff.test.ts` and the
 * http, sse and server shutdown suites; the stdio connection kept after its
 * caller cancelled in `server-runtime/src/stdio/__tests__/cancel/lateConnect.test.ts`.
 */

import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

/** The connections the factory built, each recorded. */
const built: Closable[] = [];
const records = new WeakMap<
  object,
  { settings: SapConfig; credential?: IAuthProvider }
>();
jest.mock('../../lib/connectionFactory', () => {
  const actual = jest.requireActual('../../lib/connectionFactory');
  return {
    ...actual,
    createAbapConnection: (settings: SapConfig, credential?: IAuthProvider) => {
      const connection = closable(settings.connectionType === 'rfc');
      records.set(connection, { settings, credential });
      built.push(connection);
      return connection;
    },
    siblingRecordOf: (connection: object) => {
      const record = records.get(connection);
      return record ? { settings: record.settings, credential: {} } : undefined;
    },
  };
});

import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import type { ConnectionContext } from '../../embeddable/ConnectionContext';
import { LOGOFF_NOT_WRITTEN, liveDebugPorts } from '../../lib/debugger/ports';
import {
  closeOwnedConnections,
  endConnection,
  forceClose,
  isEnded,
  own,
  ownedConnections,
  runAsOwner,
} from '../../lib/ownedConnections';
import {
  closeQuietly,
  connectionForPackageLock,
  connectionHoldingPackageLock,
  inOwnSessionOverRfc,
  openFreshConnection,
  registerFreshConnectionFactory,
  releasePackageLockSession,
} from '../../lib/packageSessions';
import {
  cleanup,
  getManagedConnection,
  setConfigOverride,
  setConnectionOverride,
} from '../../lib/utils';

interface Closable extends IAbapConnection {
  disconnects: number;
  connects: number;
  failConnect: boolean;
  live: boolean;
  /** While set, `connect()` waits for it. */
  connectGate?: Promise<void>;
  /** While set, `disconnect()` waits for it before its logoff is written. */
  writeGate?: Promise<void>;
  /** Whether the logoff was written (`disconnect()` settled). */
  written: boolean;
}

/** A connection whose `connect()` and `disconnect()` are counted; a second disconnect rejects, as connection 16's. */
function closable(rfc = false): Closable {
  const connection: Closable = {
    disconnects: 0,
    connects: 0,
    failConnect: false,
    live: true,
    written: false,
    async connect() {
      connection.connects += 1;
      if (connection.connectGate) await connection.connectGate;
      if (connection.failConnect) throw new Error('connect refused');
    },
    async disconnect() {
      connection.disconnects += 1;
      if (connection.disconnects > 1) throw new Error('ADT_NOT_CONNECTED');
      if (connection.writeGate) await connection.writeGate;
      connection.written = true;
    },
    isConnected: () => connection.live,
    getConfig: () => ({ connectionType: rfc ? 'rfc' : 'http' }),
    async getBaseUrl() {
      return 'https://system.invalid';
    },
    getSessionId: () => null,
    setSessionType() {},
    async makeAdtRequest() {
      return { data: '', status: 200, statusText: 'OK', headers: {} };
    },
  } as unknown as Closable;
  return connection;
}

const silent = { info() {}, debug() {}, warn() {}, error() {} };
const SETTINGS: SapConfig = {
  url: 'https://system.invalid',
  authType: 'basic',
  username: 'placeholder-user',
  password: 'placeholder-password',
  connectionType: 'rfc',
};

/** A credential; `authorized` counts the requests it wrote. */
function provider(): IAuthProvider & { authorized: number } {
  const ok = async () => ({ ok: true as const });
  const credential = {
    kind: 'test',
    authorized: 0,
    prepare: ok,
    establish: ok,
    authorize: async () => {
      credential.authorized += 1;
      return { ok: true as const };
    },
    rejected: ok,
  };
  return credential;
}

/** One request written by the credential `connection` presents. */
async function authorizeOn(connection: unknown): Promise<void> {
  const credential = records.get(connection as object)?.credential;
  if (credential === undefined) throw new Error('no credential recorded');
  const outcome = await credential.authorize({
    header: () => ({ ok: true }),
    cookies: () => ({ ok: true }),
  } as never);
  expect(outcome.ok).toBe(true);
}

class Server extends BaseMcpServer {
  constructor() {
    super({ name: 'ends', logger: silent, stateLogger: { error() {} } });
  }
  use(context: ConnectionContext) {
    this.setConnectionContext(context);
  }
  connection() {
    return this.getConnection(new AbortController().signal);
  }
  /** A call done with the connection `connection()` handed it (as the wrapper does). */
  done(connection: unknown) {
    this.connectionReleased(connection as AbapConnection);
  }
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => {
    open = r;
  });
  return { promise, open };
}

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  built.splice(0);
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

describe("BaseMcpServer.getConnection: the instance's own connection", () => {
  function serve(credentials: IAuthProvider[]) {
    const server = new Server();
    let i = 0;
    server.use({
      kind: 'built',
      sessionId: 's',
      source: {
        resolve: async () => ({
          settings: SETTINGS,
          credential: credentials[
            Math.min(i++, credentials.length - 1)
          ] as IAuthProvider,
        }),
      },
    });
    return server;
  }

  it('ends at the terminal close, once', async () => {
    const server = serve([provider()]);
    await server.connection();
    await server.terminalClose();
    await server.terminalClose();
    expect(built.map((c) => c.disconnects)).toEqual([1]);
  });

  it('a failed connect ends at once, and the next call connects afresh', async () => {
    const server = serve([provider()]);
    const failing = closable();
    failing.failConnect = true;
    const real = jest.requireMock('../../lib/connectionFactory') as {
      createAbapConnection: (s: SapConfig) => Closable;
    };
    const spy = jest
      .spyOn(real, 'createAbapConnection')
      .mockImplementationOnce(() => {
        built.push(failing);
        return failing;
      });
    await expect(server.connection()).rejects.toThrow('connect refused');
    expect(failing.disconnects).toBe(1);
    spy.mockRestore();
    await server.connection();
    expect(built).toHaveLength(2);
    await server.terminalClose();
    expect(failing.disconnects).toBe(1);
    expect(built[1]?.disconnects).toBe(1);
  });

  it('a new credential after the last call was released: the same connection, presenting the new credential; nothing logged off before the terminal close', async () => {
    const before = provider();
    const renewed = provider();
    const server = serve([before, renewed]);
    const first = await server.connection();
    await authorizeOn(first);
    server.done(first);
    const second = await server.connection();
    expect(second).toBe(first);
    expect(built).toHaveLength(1);
    expect(built[0]?.disconnects).toBe(0);
    await authorizeOn(second);
    expect(before.authorized).toBe(1);
    expect(renewed.authorized).toBe(1);
    server.done(second);
    await server.terminalClose();
    expect(built.map((c) => c.disconnects)).toEqual([1]);
  });

  it('a new credential while a call works on the connection: the same connection for both, nothing logged off under either', async () => {
    const server = serve([provider(), provider()]);
    const first = await server.connection(); // a call in flight on it
    const second = await server.connection(); // another credential
    expect(second).toBe(first);
    await turns();
    expect(built[0]?.disconnects).toBe(0);
    server.done(first);
    await turns();
    expect(built[0]?.disconnects).toBe(0);
    server.done(second);
    await server.terminalClose();
    expect(built.map((c) => c.disconnects)).toEqual([1]);
  });

  it('a new credential while the connect is still running: the call waits for the same connect, nothing logged off', async () => {
    const connecting = gate();
    const real = jest.requireMock('../../lib/connectionFactory') as {
      createAbapConnection: (s: SapConfig, c?: IAuthProvider) => Closable;
    };
    const held = closable(true);
    held.connectGate = connecting.promise;
    jest
      .spyOn(real, 'createAbapConnection')
      .mockImplementationOnce((settings, credential) => {
        records.set(held, { settings, credential });
        built.push(held);
        return held;
      });
    const before = provider();
    const renewed = provider();
    const server = serve([before, renewed]);
    const a = server.connection(); // waits in the held connect
    await turns();
    const b = server.connection(); // another credential: the same connect
    connecting.open();
    expect(await a).toBe(held);
    expect(await b).toBe(held);
    expect(built).toHaveLength(1);
    await authorizeOn(held);
    expect(before.authorized).toBe(0);
    expect(renewed.authorized).toBe(1);
    await turns();
    expect(held.disconnects).toBe(0);
    server.done(held);
    server.done(held);
    await server.terminalClose();
    expect(held.disconnects).toBe(1);
  });

  it('a session SAP lost: a new connection instance for the next call; the spent one ends once, after the call on it', async () => {
    const credential = provider();
    const server = serve([credential]);
    const first = (await server.connection()) as unknown as Closable;
    first.live = false; // connection 16: the session was lost, the instance spent
    const second = await server.connection();
    expect(second).not.toBe(first);
    expect(built).toHaveLength(2);
    await turns();
    expect(first.disconnects).toBe(0);
    server.done(first);
    await turns();
    expect(first.disconnects).toBe(1);
    server.done(second);
    await server.terminalClose();
    expect(built.map((c) => c.disconnects)).toEqual([1, 1]);
  });

  it('an injected connection is the consumer’s: never disconnected', async () => {
    const injected = closable();
    const server = new Server();
    server.use({
      kind: 'injected',
      connection: injected as unknown as AbapConnection,
      sessionId: 'i',
    });
    await server.connection();
    await server.terminalClose();
    await forceClose();
    expect(injected.disconnects).toBe(0);
  });
});

describe('the fresh connections', () => {
  it('openFreshConnection, a sibling: its caller ends it once; a failed connect ends it once', async () => {
    const base = closable();
    records.set(base, { settings: SETTINGS });
    const fresh = (await openFreshConnection(base, undefined)) as Closable;
    await closeQuietly(fresh, undefined, 'test');
    expect(fresh.disconnects).toBe(1);

    const real = jest.requireMock('../../lib/connectionFactory') as {
      createAbapConnection: (s: SapConfig) => Closable;
    };
    const failing = closable();
    failing.failConnect = true;
    jest
      .spyOn(real, 'createAbapConnection')
      .mockImplementationOnce(() => failing);
    await expect(openFreshConnection(base, undefined)).rejects.toThrow(
      'connect refused',
    );
    expect(failing.disconnects).toBe(1);
  });

  it("a consumer's freshConnection result is the server's: ended once on success and on failure", async () => {
    const injected = closable(true);
    const given: Closable[] = [];
    registerFreshConnectionFactory(injected, async () => {
      const c = closable(true);
      given.push(c);
      return c;
    });
    await inOwnSessionOverRfc(injected, undefined, 'test', async () => 'ok');
    await expect(
      inOwnSessionOverRfc(injected, undefined, 'test', async () => {
        throw new Error('the operation failed');
      }),
    ).rejects.toThrow('the operation failed');
    expect(given.map((c) => c.disconnects)).toEqual([1, 1]);
    expect(injected.disconnects).toBe(0);
  });

  it('inOwnSessionOverRfc, a sibling: ended once on success and on failure', async () => {
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    await inOwnSessionOverRfc(base, undefined, 'test', async () => 'ok');
    await expect(
      inOwnSessionOverRfc(base, undefined, 'test', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(built.map((c) => c.disconnects)).toEqual([1, 1]);
    expect(base.disconnects).toBe(0);
  });
});

describe('package lock sessions', () => {
  it('a lock not taken: drop() ends it once', async () => {
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    const lockOn = await connectionForPackageLock(base, undefined);
    await lockOn.drop();
    expect(built.map((c) => c.disconnects)).toEqual([1]);
  });

  it('held under its handle: the unlock ends it once', async () => {
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    const lockOn = await connectionForPackageLock(base, undefined);
    lockOn.keep('H1');
    await releasePackageLockSession('H1', undefined);
    await releasePackageLockSession('H1', undefined);
    expect(built.map((c) => c.disconnects)).toEqual([1]);
  });

  it("still held at the instance's terminal close: ended once, and its handle forgotten", async () => {
    const owner = {};
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    const lockOn = await runAsOwner(owner, () =>
      connectionForPackageLock(base, undefined),
    );
    lockOn.keep('H2');
    expect(connectionHoldingPackageLock(base, 'H2')).toBe(lockOn.connection);
    await closeOwnedConnections(owner);
    expect(built.map((c) => c.disconnects)).toEqual([1]);
    expect(connectionHoldingPackageLock(base, 'H2')).toBe(base);
    await releasePackageLockSession('H2', undefined);
    expect(built.map((c) => c.disconnects)).toEqual([1]);
  });
});

describe("the debugger's own connections", () => {
  it('closed at its stop, dropped when SAP freed its session — each ended once, the terminal close joins', async () => {
    const owner = {};
    const ports = liveDebugPorts();
    const closed = closable();
    const dropped = closable();
    own(closed, { owner, role: 'state' });
    own(dropped, { owner, role: 'state' });
    await ports.closeConnection(closed);
    ports.dropConnection(dropped);
    await closeOwnedConnections(owner);
    expect(closed.disconnects).toBe(1);
    expect(dropped.disconnects).toBe(1);
  });

  it("one whose close was never asked: the instance's terminal close ends it, once", async () => {
    const owner = {};
    const state = closable();
    own(state, { owner, role: 'state' });
    await closeOwnedConnections(owner, ['state']);
    await closeOwnedConnections(owner);
    expect(state.disconnects).toBe(1);
  });
});

describe('the forced close', () => {
  it('ends every owned connection, joining one already under way: never a second disconnect()', async () => {
    const a = closable();
    const b = closable();
    own(a, { owner: {}, role: 'built' });
    own(b, { role: 'fresh' });
    const running = endConnection(a);
    await forceClose();
    await running;
    expect(a.disconnects).toBe(1);
    expect(b.disconnects).toBe(1);
    expect(isEnded(a) && isEnded(b)).toBe(true);
    expect(ownedConnections()).toEqual([]);
  });

  it('awaits a logoff an orderly end began and has not written yet: joined, disconnect() once', async () => {
    const c = closable();
    const write = gate();
    c.writeGate = write.promise;
    own(c, { owner: {}, role: 'built' });
    const orderly = endConnection(c); // the orderly terminal close, writing
    let forced = false;
    const forcing = forceClose().then(() => {
      forced = true;
    });
    await turns();
    expect(forced).toBe(false);
    write.open();
    await forcing;
    await orderly;
    expect(c.written).toBe(true);
    expect(c.disconnects).toBe(1);
  });

  it("a site's own end after the forced close joins it: disconnect() once, no failure reported", async () => {
    const c = closable(true);
    own(c, { role: 'fresh' });
    await forceClose();
    const warned: string[] = [];
    await closeQuietly(
      c,
      { warn: (m: string) => warned.push(m) } as never,
      'test',
    );
    expect(c.disconnects).toBe(1);
    expect(warned).toEqual([]);
  });
});

describe("the debugger's close failure goes back to its session", () => {
  it('in fixed words; a later close joins and sends nothing again', async () => {
    const ports = liveDebugPorts();
    const c = closable();
    (c as unknown as { disconnect: () => Promise<void> }).disconnect =
      async () => {
        c.disconnects += 1;
        throw new Error('a secret-looking socket error');
      };
    own(c, { role: 'state' });
    await expect(ports.closeConnection(c)).rejects.toThrow(LOGOFF_NOT_WRITTEN);
    await expect(ports.closeConnection(c)).resolves.toBeUndefined();
    expect(c.disconnects).toBe(1);
  });
});

describe('the ./utils process cache', () => {
  afterEach(() => cleanup());

  it('a managed connection replaced by a new config, and one dropped by cleanup(), each end once; a connection handed in is the caller’s', async () => {
    setConfigOverride({ ...SETTINGS, url: 'https://one.invalid' });
    const firstOverride = built[0];
    expect(getManagedConnection()).toBe(firstOverride);
    setConfigOverride({ ...SETTINGS, url: 'https://two.invalid' });
    expect(firstOverride?.disconnects).toBe(1);
    const given = closable();
    setConnectionOverride(given);
    expect(built[1]?.disconnects).toBe(1);
    cleanup();
    expect(given.disconnects).toBe(0);
  });
});
