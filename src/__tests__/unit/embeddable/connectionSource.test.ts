/**
 * The `Source` union: an instance's connection is either built
 * from a `ConnectionSource` — `resolve(signal)` with the caller's signal,
 * then a connector over what it answered, connected — or injected by an
 * embedder and used as given: the same object, no `connect()`, no wrap, no
 * connector built.
 */

import assert from 'node:assert/strict';
import {
  after,
  before,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import {
  type AbapConnection,
  type CreatedConnection,
  createConnection,
  type SapConfig,
} from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type {
  ConnectionContext,
  ConnectionSource,
} from '../../../embeddable/ConnectionContext';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import * as connectionFactory from '../../../lib/connectionFactory';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { presented } from '../../helpers/presented';
import { stateSystemKind } from '../../helpers/systemKind';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time), as the Jest factory
// did; the names it left out stay real.
const build = mock.method(
  connectionFactory,
  'createAbapConnection',
  () => undefined,
);
// The connect's system lookup asks the kind: on-premise sends nothing.
mock.method(connectionFactory, 'systemKindOf', () => 'onprem');
// A view over a connection keeps its kind: the kind is mocked above.
mock.method(connectionFactory, 'withSystemKindOf', (view: object) => view);
// The one kind agrees: the kind is mocked above.
mock.method(connectionFactory, 'admitOnKind', () => undefined);

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0', logger: silent });
  }
  use(context: ConnectionContext) {
    this.setConnectionContext(context);
  }
  connection(signal: AbortSignal) {
    return this.getConnection(signal);
  }
}

const SETTINGS: SapConfig = {
  url: 'https://system.example.invalid',
  authType: 'jwt',
};

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

let stand: AdtStandIn;

before(async () => {
  stand = await adtStandIn();
});

after(async () => {
  await stand.close();
});

/**
 * A real connection to the stand-in that sends nothing: its `connect` is a
 * spy that resolves.
 */
function quietConnection(): CreatedConnection {
  const connection = createConnection({
    config: { url: stand.url, authType: 'basic' },
    credential: provider(),
    system: 'onprem',
    transport: 'http',
  });
  mock.method(connection, 'connect', async () => {});
  return connection;
}

beforeEach(() => {
  build.mock.resetCalls();
  build.mock.mockImplementation(() => quietConnection());
});

describe("'built': the source resolves, the connection is built from its answer", () => {
  it('calls resolve with the signal the caller passes', async () => {
    const credential = provider();
    const resolve = mock.fn(async (_signal: AbortSignal) => ({
      settings: SETTINGS,
      credential,
    }));
    const source: ConnectionSource = { resolve };
    const server = new TestServer();
    server.use({ kind: 'built', source });

    const signal = new AbortController().signal;
    const connection = await server.connection(signal);

    assert.equal(resolve.mock.callCount(), 1);
    assert.equal(resolve.mock.calls[0]?.arguments[0], signal);
    assert.equal(build.mock.callCount(), 1);
    assert.deepStrictEqual(build.mock.calls[0]?.arguments[0], SETTINGS);
    assert.equal(presented(build.mock.calls[0]?.arguments[1]), credential);
    assert.equal(connection, build.mock.calls[0]?.result);
    assert.equal(
      (
        connection as unknown as { connect: Mock<() => Promise<void>> }
      ).connect.mock.callCount(),
      1,
    );
  });
});

describe("'injected': the connection is used as given", () => {
  it('the same object, never connected, never wrapped, no connector built', async () => {
    const connect = mock.fn(async () => {});
    const injected = { connect } as unknown as AbapConnection;
    const server = new TestServer();
    server.use({ kind: 'injected', connection: injected });

    const signal = new AbortController().signal;
    assert.equal(await server.connection(signal), injected);
    assert.equal(await server.connection(signal), injected);
    assert.equal(connect.mock.callCount(), 0);
    assert.equal(build.mock.callCount(), 0);
  });

  it("EmbeddableMcpServer's connection option is an injected source", async () => {
    const connect = mock.fn(async () => {});
    const injected = { connect } as unknown as AbapConnection;
    const server = new EmbeddableMcpServer({
      connection: injected,
      logger: silent,
      handlersRegistry: { registerAllTools: () => {} } as never,
    });
    const reach = server as unknown as {
      getConnection(signal: AbortSignal): Promise<AbapConnection>;
    };
    assert.equal(
      await reach.getConnection(new AbortController().signal),
      injected,
    );
    assert.equal(connect.mock.callCount(), 0);
    assert.equal(build.mock.callCount(), 0);
  });
});
