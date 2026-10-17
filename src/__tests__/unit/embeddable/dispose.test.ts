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

import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  siblingRecordOf: jest.fn(() => undefined),
  // The connect's system lookup asks the kind: on-premise sends nothing.
  systemKindOf: jest.fn(() => 'onprem'),
}));

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ConnectionContext } from '../../../embeddable/ConnectionContext';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { own, ownedConnections } from '../../../lib/ownedConnections';
import type { StatePart } from '../../../lib/state/InstanceState';

const build = createAbapConnection as jest.MockedFunction<
  typeof createAbapConnection
>;
const silent = { info() {}, debug() {}, warn() {}, error() {} };

interface Recorded {
  connection: AbapConnection;
  disconnects: () => number;
}

function recorded(): Recorded {
  let disconnects = 0;
  const connection = {
    connect: jest.fn(async () => {}),
    disconnect: jest.fn(async () => {
      disconnects += 1;
      // connection 16: a second disconnect() rejects NOT_CONNECTED.
      if (disconnects > 1) throw new Error('ADT_NOT_CONNECTED');
    }),
  } as unknown as AbapConnection;
  return { connection, disconnects: () => disconnects };
}

class TestServer extends BaseMcpServer {
  constructor() {
    super({
      name: 'dispose-test',
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
  build.mockImplementation(() => own_.connection);
  const server = new TestServer();
  const credential = provider();
  server.use({
    kind: 'built',
    sessionId: 's',
    source: { resolve: async () => ({ settings: SETTINGS, credential }) },
  });
  return { server, built: own_ };
}

beforeEach(() => {
  build.mockReset();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

it('dispose() undoes the state and closes no connection', async () => {
  const { server, built } = builtServer();
  await server.connection();
  const { part } = failingPart(0);
  server.state.attach(part);
  await server.dispose();
  expect(server.holdsState()).toBe(false);
  expect(built.disconnects()).toBe(0);
  await server.terminalClose();
});

it('a second dispose() after a failed undo retries it', async () => {
  const { server } = builtServer();
  const { part, disposals } = failingPart(1);
  server.state.attach(part);
  await expect(server.dispose()).rejects.toThrow(/stop refused/);
  expect(server.holdsState()).toBe(true);
  await server.dispose();
  expect(disposals()).toBe(2);
  expect(server.holdsState()).toBe(false);
});

it('the terminal close disconnects each connection the instance owns once — after a failed undo too — and a second one disconnects nothing', async () => {
  const { server, built } = builtServer();
  await server.connection();
  // Held state's own connection, recorded as this instance's.
  const stateOwn = recorded();
  own(stateOwn.connection, { owner: server, role: 'state' });
  const { part } = failingPart(Number.POSITIVE_INFINITY);
  server.state.attach(part);

  await expect(server.dispose()).rejects.toThrow(/stop refused/);
  expect(server.holdsState()).toBe(true);

  await server.terminalClose();
  expect(built.disconnects()).toBe(1);
  expect(stateOwn.disconnects()).toBe(1);
  expect(ownedConnections(server)).toEqual([]);

  await server.terminalClose();
  expect(built.disconnects()).toBe(1);
  expect(stateOwn.disconnects()).toBe(1);
});

it('an injected connection is the consumer’s: never disconnected', async () => {
  const injected = recorded();
  const server = new TestServer();
  server.use({
    kind: 'injected',
    connection: injected.connection,
    sessionId: 'i',
  });
  expect(await server.connection()).toBe(injected.connection);
  await server.dispose();
  await server.terminalClose();
  expect(injected.disconnects()).toBe(0);
  expect(ownedConnections(server)).toEqual([]);
});
