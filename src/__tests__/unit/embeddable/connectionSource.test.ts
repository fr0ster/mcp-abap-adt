/**
 * The `Source` union: an instance's connection is either built
 * from a `ConnectionSource` — `resolve(signal)` with the caller's signal,
 * then a connector over what it answered, connected — or injected by an
 * embedder and used as given: the same object, no `connect()`, no wrap, no
 * connector built.
 */

import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  // The connect's system lookup asks the kind: on-premise sends nothing.
  systemKindOf: jest.fn(() => 'onprem'),
}));

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type {
  ConnectionContext,
  ConnectionSource,
} from '../../../embeddable/ConnectionContext';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { stateSystemKind } from '../../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const build = createAbapConnection as jest.MockedFunction<
  typeof createAbapConnection
>;
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

beforeEach(() => {
  build.mockReset();
  build.mockImplementation(
    () => ({ connect: jest.fn(async () => {}) }) as unknown as AbapConnection,
  );
});

describe("'built': the source resolves, the connection is built from its answer", () => {
  it('calls resolve with the signal the caller passes', async () => {
    const credential = provider();
    const resolve = jest.fn(async (_signal: AbortSignal) => ({
      settings: SETTINGS,
      credential,
    }));
    const source: ConnectionSource = { resolve };
    const server = new TestServer();
    server.use({ kind: 'built', source, sessionId: 's' });

    const signal = new AbortController().signal;
    const connection = await server.connection(signal);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0][0]).toBe(signal);
    expect(build).toHaveBeenCalledWith(SETTINGS, credential);
    expect(connection).toBe(build.mock.results[0].value);
    expect(
      (connection as unknown as { connect: jest.Mock }).connect,
    ).toHaveBeenCalledTimes(1);
  });
});

describe("'injected': the connection is used as given", () => {
  it('the same object, never connected, never wrapped, no connector built', async () => {
    const connect = jest.fn(async () => {});
    const injected = { connect } as unknown as AbapConnection;
    const server = new TestServer();
    server.use({ kind: 'injected', connection: injected, sessionId: 's' });

    const signal = new AbortController().signal;
    expect(await server.connection(signal)).toBe(injected);
    expect(await server.connection(signal)).toBe(injected);
    expect(connect).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });

  it("EmbeddableMcpServer's connection option is an injected source", async () => {
    const connect = jest.fn(async () => {});
    const injected = { connect } as unknown as AbapConnection;
    const server = new EmbeddableMcpServer({
      connection: injected,
      logger: silent,
      handlersRegistry: { registerAllTools: () => {} } as never,
    });
    const reach = server as unknown as {
      getConnection(signal: AbortSignal): Promise<AbapConnection>;
    };
    expect(await reach.getConnection(new AbortController().signal)).toBe(
      injected,
    );
    expect(connect).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });
});
