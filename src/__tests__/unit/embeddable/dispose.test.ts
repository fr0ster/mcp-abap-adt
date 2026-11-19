/**
 * `BaseMcpServer.dispose()` and the terminal close beside it:
 *
 * - `dispose()` is the state undo only: it closes no connection, and a second
 *   call after a failed undo retries it (main's contract, which the pool's
 *   retry relies on);
 * - the terminal close (`terminalClose()`, lib's `closeOwnedConnections`)
 *   disconnects each connection the instance owns once — also after a failed
 *   undo — and a second terminal close disconnects nothing again;
 * - an injected connection is the consumer's and is never disconnected.
 */

import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  beforeEach,
  it,
  type Mock,
  mock,
} from 'node:test';
import {
  type CreatedConnection,
  createConnection,
  type SapConfig,
} from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ConnectionContext } from '../../../embeddable/ConnectionContext';
import * as connectionFactory from '../../../lib/connectionFactory';
import { own, ownedConnections } from '../../../lib/ownedConnections';
import type { StatePart } from '../../../lib/state/InstanceState';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { assertRejects } from '../../helpers/assertions';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// Every case restores every mock after it: they are replaced before each.
let build: Mock<
  typeof connectionFactory.createAbapConnection | (() => undefined)
>;
beforeEach(() => {
  build = mock.method(
    connectionFactory,
    'createAbapConnection',
    () => undefined,
  );
  mock.method(connectionFactory, 'siblingRecordOf', () => undefined);
  // The connect's system lookup asks the kind: on-premise sends nothing.
  mock.method(connectionFactory, 'systemKindOf', () => 'onprem');
  // A view over a connection keeps its kind: the kind is mocked above.
  mock.method(connectionFactory, 'withSystemKindOf', (view: object) => view);
  // The one kind agrees: the kind is mocked above.
  mock.method(connectionFactory, 'admitOnKind', () => undefined);
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };

interface Recorded {
  connection: CreatedConnection;
  disconnects: () => number;
}

let stand: AdtStandIn;

before(async () => {
  stand = await adtStandIn();
});

after(async () => {
  await stand.close();
});

/**
 * A real connection to the stand-in that sends nothing: `connect` and
 * `disconnect` are spies, the latter counting its calls.
 */
function recorded(): Recorded {
  let disconnects = 0;
  const connection = createConnection({
    config: { url: stand.url, authType: 'basic' },
    credential: provider(),
    system: 'onprem',
    transport: 'http',
  });
  mock.method(connection, 'connect', async () => {});
  mock.method(connection, 'disconnect', async () => {
    disconnects += 1;
    // connection 16: a second disconnect() rejects NOT_CONNECTED.
    if (disconnects > 1) throw new Error('ADT_NOT_CONNECTED');
  });
  return { connection, disconnects: () => disconnects };
}

class TestServer extends BaseMcpServer {
  constructor() {
    super({
      name: 'dispose-test',
      systemType: 'onprem',
      version: '1.0.0',
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
}

const SETTINGS: SapConfig = { url: 'https://system.invalid', authType: 'jwt' };

function provider(): IAuthProvider {
  const ok = async () => ({ ok: true as const });
  return {
    kind: 'test',
    prepare: ok,
    establish: ok,
    authorize: ok,
    rejected: ok,
  };
}

/** A state part whose undo fails `failures` times, then succeeds. */
function failingPart(failures: number) {
  let holding = true;
  let left = failures;
  let disposals = 0;
  const part: StatePart = {
    holdsState: () => holding,
    pending: () => false,
    failures: () => (holding && left >= 0 ? ['stop refused'] : []),
    observe: () => {},
    dispose: async () => {
      disposals += 1;
      if (left > 0) {
        left -= 1;
        throw new Error('stop refused');
      }
      holding = false;
    },
  };
  return { part, disposals: () => disposals };
}

function builtServer() {
  const own_ = recorded();
  build.mock.mockImplementation(() => own_.connection);
  const server = new TestServer();
  const credential = provider();
  server.use({
    kind: 'built',
    source: { resolve: async () => ({ settings: SETTINGS, credential }) },
  });
  return { server, built: own_ };
}

beforeEach(() => {
  mock.method(process.stderr, 'write', () => true);
});

afterEach(() => mock.restoreAll());

it('dispose() undoes the state and closes no connection', async () => {
  const { server, built } = builtServer();
  await server.connection();
  const { part } = failingPart(0);
  server.state.attach(part);
  await server.dispose();
  assert.equal(server.holdsState(), false);
  assert.equal(built.disconnects(), 0);
  await server.terminalClose();
});

it('a second dispose() after a failed undo retries it', async () => {
  const { server } = builtServer();
  const { part, disposals } = failingPart(1);
  server.state.attach(part);
  await assertRejects(server.dispose(), /stop refused/);
  assert.equal(server.holdsState(), true);
  await server.dispose();
  assert.equal(disposals(), 2);
  assert.equal(server.holdsState(), false);
});

it('the terminal close disconnects each connection the instance owns once — after a failed undo too — and a second one disconnects nothing', async () => {
  const { server, built } = builtServer();
  await server.connection();
  // Held state's own connection, recorded as this instance's.
  const stateOwn = recorded();
  own(stateOwn.connection, { owner: server, role: 'state' });
  const { part } = failingPart(Number.POSITIVE_INFINITY);
  server.state.attach(part);

  await assertRejects(server.dispose(), /stop refused/);
  assert.equal(server.holdsState(), true);

  await server.terminalClose();
  assert.equal(built.disconnects(), 1);
  assert.equal(stateOwn.disconnects(), 1);
  assert.deepStrictEqual(ownedConnections(server), []);

  await server.terminalClose();
  assert.equal(built.disconnects(), 1);
  assert.equal(stateOwn.disconnects(), 1);
});

it('an injected connection is the consumer’s: never disconnected', async () => {
  const injected = recorded();
  const server = new TestServer();
  server.use({
    kind: 'injected',
    connection: injected.connection,
  });
  assert.equal(await server.connection(), injected.connection);
  await server.dispose();
  await server.terminalClose();
  assert.equal(injected.disconnects(), 0);
  assert.deepStrictEqual(ownedConnections(server), []);
});
