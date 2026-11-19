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

/** The connections the factory built, each recorded. */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import type { ConnectionContext } from '../../embeddable/ConnectionContext';
import * as connectionFactory from '../../lib/connectionFactory';
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
import { assertRejects } from '../helpers/assertions';

const built: Closable[] = [];
const records = new WeakMap<
  object,
  { settings: SapConfig; credential?: IAuthProvider | undefined }
>();

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time), as the Jest factory
// did; the names it left out stay real.
// Every case restores every mock after it: they are replaced before each.
beforeEach(() => {
  // The real exports, read before any is replaced.
  const actual = { ...connectionFactory };

  mock.method(
    connectionFactory,
    'createAbapConnection',
    (settings: SapConfig, credential?: IAuthProvider) => {
      const connection = closable(settings.connectionType === 'rfc');
      records.set(connection, { settings, credential });
      built.push(connection);
      return connection;
    },
  );
  mock.method(connectionFactory, 'siblingRecordOf', (connection: object) => {
    const record = records.get(connection);
    return record ? { settings: record.settings, credential: {} } : undefined;
  });
});

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
  authType: 'basic',
  username: 'placeholder-user',
  password: 'placeholder-password',
  connectionType: 'rfc',
  client: '100',
  language: 'EN',
  ashost: 'system.invalid',
  sysnr: '00',
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
  assert.equal(outcome.ok, true);
}

class Server extends BaseMcpServer {
  constructor() {
    super({
      name: 'ends',
      systemType: 'onprem',
      logger: silent,
      stateLogger: { error() {} },
    });
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
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

describe("BaseMcpServer.getConnection: the instance's own connection", () => {
  function serve(credentials: IAuthProvider[]) {
    const server = new Server();
    let i = 0;
    server.use({
      kind: 'built',
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
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
  });

  it('a failed connect ends at once, and the next call connects afresh', async (t) => {
    const server = serve([provider()]);
    const failing = closable();
    failing.failConnect = true;
    const real = connectionFactory as unknown as {
      createAbapConnection: (s: SapConfig) => Closable;
    };
    const spy = t.mock.method(real, 'createAbapConnection');
    spy.mock.mockImplementationOnce(() => {
      built.push(failing);
      return failing;
    }, 0);
    await assertRejects(server.connection(), 'connect refused');
    assert.equal(failing.disconnects, 1);
    spy.mock.restore();
    await server.connection();
    assert.equal(built.length, 2);
    await server.terminalClose();
    assert.equal(failing.disconnects, 1);
    assert.equal(built[1]?.disconnects, 1);
  });

  it('a new credential after the last call was released: the same connection, presenting the new credential; nothing logged off before the terminal close', async () => {
    const before = provider();
    const renewed = provider();
    const server = serve([before, renewed]);
    const first = await server.connection();
    await authorizeOn(first);
    server.done(first);
    const second = await server.connection();
    assert.equal(second, first);
    assert.equal(built.length, 1);
    assert.equal(built[0]?.disconnects, 0);
    await authorizeOn(second);
    assert.equal(before.authorized, 1);
    assert.equal(renewed.authorized, 1);
    server.done(second);
    await server.terminalClose();
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
  });

  it('a new credential while a call works on the connection: the same connection for both, nothing logged off under either', async () => {
    const server = serve([provider(), provider()]);
    const first = await server.connection(); // a call in flight on it
    const second = await server.connection(); // another credential
    assert.equal(second, first);
    await turns();
    assert.equal(built[0]?.disconnects, 0);
    server.done(first);
    await turns();
    assert.equal(built[0]?.disconnects, 0);
    server.done(second);
    await server.terminalClose();
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
  });

  it('a new credential while the connect is still running: the call waits for the same connect, nothing logged off', async (t) => {
    const connecting = gate();
    const real = connectionFactory as unknown as {
      createAbapConnection: (s: SapConfig, c?: IAuthProvider) => Closable;
    };
    const held = closable(true);
    held.connectGate = connecting.promise;
    t.mock
      .method(real, 'createAbapConnection')
      .mock.mockImplementationOnce((settings, credential) => {
        records.set(held, { settings, credential });
        built.push(held);
        return held;
      }, 0);
    const before = provider();
    const renewed = provider();
    const server = serve([before, renewed]);
    const a = server.connection(); // waits in the held connect
    await turns();
    const b = server.connection(); // another credential: the same connect
    connecting.open();
    assert.equal(await a, held);
    assert.equal(await b, held);
    assert.equal(built.length, 1);
    await authorizeOn(held);
    assert.equal(before.authorized, 0);
    assert.equal(renewed.authorized, 1);
    await turns();
    assert.equal(held.disconnects, 0);
    server.done(held);
    server.done(held);
    await server.terminalClose();
    assert.equal(held.disconnects, 1);
  });

  it('a session SAP lost: a new connection instance for the next call; the spent one ends once, after the call on it', async () => {
    const credential = provider();
    const server = serve([credential]);
    const first = (await server.connection()) as unknown as Closable;
    first.live = false; // connection 16: the session was lost, the instance spent
    const second = await server.connection();
    assert.notEqual(second, first);
    assert.equal(built.length, 2);
    await turns();
    assert.equal(first.disconnects, 0);
    server.done(first);
    await turns();
    assert.equal(first.disconnects, 1);
    server.done(second);
    await server.terminalClose();
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1, 1],
    );
  });

  it('an injected connection is the consumer’s: never disconnected', async () => {
    const injected = closable();
    const server = new Server();
    server.use({
      kind: 'injected',
      connection: injected as unknown as AbapConnection,
    });
    await server.connection();
    await server.terminalClose();
    await forceClose();
    assert.equal(injected.disconnects, 0);
  });
});

describe('the fresh connections', () => {
  it('openFreshConnection, a sibling: its caller ends it once; a failed connect ends it once', async (t) => {
    const base = closable();
    records.set(base, { settings: SETTINGS });
    const fresh = (await openFreshConnection(base, undefined)) as Closable;
    await closeQuietly(fresh, undefined, 'test');
    assert.equal(fresh.disconnects, 1);

    const real = connectionFactory as unknown as {
      createAbapConnection: (s: SapConfig) => Closable;
    };
    const failing = closable();
    failing.failConnect = true;
    t.mock
      .method(real, 'createAbapConnection')
      .mock.mockImplementationOnce(() => failing, 0);
    await assertRejects(
      openFreshConnection(base, undefined),
      'connect refused',
    );
    assert.equal(failing.disconnects, 1);
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
    await assertRejects(
      inOwnSessionOverRfc(injected, undefined, 'test', async () => {
        throw new Error('the operation failed');
      }),
      'the operation failed',
    );
    assert.deepStrictEqual(
      given.map((c) => c.disconnects),
      [1, 1],
    );
    assert.equal(injected.disconnects, 0);
  });

  it('inOwnSessionOverRfc, a sibling: ended once on success and on failure', async () => {
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    await inOwnSessionOverRfc(base, undefined, 'test', async () => 'ok');
    await assertRejects(
      inOwnSessionOverRfc(base, undefined, 'test', async () => {
        throw new Error('failed');
      }),
      'failed',
    );
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1, 1],
    );
    assert.equal(base.disconnects, 0);
  });
});

describe('package lock sessions', () => {
  it('a lock not taken: drop() ends it once', async () => {
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    const lockOn = await connectionForPackageLock(base, undefined);
    await lockOn.drop();
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
  });

  it('held under its handle: the unlock ends it once', async () => {
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    const lockOn = await connectionForPackageLock(base, undefined);
    lockOn.keep('H1');
    await releasePackageLockSession('H1', undefined);
    await releasePackageLockSession('H1', undefined);
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
  });

  it("still held at the instance's terminal close: ended once, and its handle forgotten", async () => {
    const owner = {};
    const base = closable(true);
    records.set(base, { settings: SETTINGS });
    const lockOn = await runAsOwner(owner, () =>
      connectionForPackageLock(base, undefined),
    );
    lockOn.keep('H2');
    assert.equal(connectionHoldingPackageLock(base, 'H2'), lockOn.connection);
    await closeOwnedConnections(owner);
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
    assert.equal(connectionHoldingPackageLock(base, 'H2'), base);
    await releasePackageLockSession('H2', undefined);
    assert.deepStrictEqual(
      built.map((c) => c.disconnects),
      [1],
    );
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
    assert.equal(closed.disconnects, 1);
    assert.equal(dropped.disconnects, 1);
  });

  it("one whose close was never asked: the instance's terminal close ends it, once", async () => {
    const owner = {};
    const state = closable();
    own(state, { owner, role: 'state' });
    await closeOwnedConnections(owner, ['state']);
    await closeOwnedConnections(owner);
    assert.equal(state.disconnects, 1);
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
    assert.equal(a.disconnects, 1);
    assert.equal(b.disconnects, 1);
    assert.equal(isEnded(a) && isEnded(b), true);
    assert.deepStrictEqual(ownedConnections(), []);
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
    assert.equal(forced, false);
    write.open();
    await forcing;
    await orderly;
    assert.equal(c.written, true);
    assert.equal(c.disconnects, 1);
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
    assert.equal(c.disconnects, 1);
    assert.deepStrictEqual(warned, []);
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
    await assertRejects(ports.closeConnection(c), LOGOFF_NOT_WRITTEN);
    assert.equal(await ports.closeConnection(c), undefined);
    assert.equal(c.disconnects, 1);
  });
});

describe('the ./utils process cache', () => {
  afterEach(() => cleanup());

  it('a managed connection replaced by a new config, and one dropped by cleanup(), each end once; a connection handed in is the caller’s', async () => {
    setConfigOverride({ ...SETTINGS, ashost: 'one.invalid' }, 'onprem');
    const firstOverride = built[0];
    assert.equal(getManagedConnection(), firstOverride);
    setConfigOverride({ ...SETTINGS, ashost: 'two.invalid' }, 'onprem');
    assert.equal(firstOverride?.disconnects, 1);
    const given = closable();
    setConnectionOverride(given);
    assert.equal(built[1]?.disconnects, 1);
    cleanup();
    assert.equal(given.disconnects, 0);
  });
});
