/**
 * A background run's connection while it is being born: the host's factory
 * still building it, or its `connect()` still under way. The instance whose
 * call started the run reaches it from its birth: the instance's close
 * asks its logoff at once, before the connect settles, and a connection the
 * factory hands over after the close is never connected.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { closeInstance } from '../../../lib/instanceClose';
import { ownedConnections } from '../../../lib/ownedConnections';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import { clientOf, shippedGroups, silent, until } from './harness';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const RUN = { class_name: 'PLACEHOLDER_CLASS', background: true };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A connection the host's factory hands over; its connect waits for the case. */
function heldConnection(events: string[], connect: Deferred<void>) {
  return {
    connect: async () => {
      events.push('connect');
      await connect.promise;
      events.push('connected');
    },
    disconnect: async () => {
      events.push('disconnect');
    },
    setSessionType: () => {},
  } as unknown as IAbapConnection;
}

async function embedder(factory: () => Promise<IAbapConnection>) {
  const standIn = await adtStandIn();
  standIn.body(
    (r) => r.url.startsWith('/sap/bc/adt/core/http/systeminformation'),
    JSON.stringify({ systemID: 'SID', userName: 'embedded_user' }),
  );
  const built = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    new BasicAuthProvider('EMBEDDED_USER', 'embedded-password'),
  );
  await built.connect();
  // Not the factory's own object: the host's factory alone gives a fresh one.
  const injected = new Proxy({} as IAbapConnection, {
    get: (_target, property) => {
      const value = Reflect.get(built as object, property);
      return typeof value === 'function' ? value.bind(built) : value;
    },
  });
  const strategy = new InMemoryBackgroundRuns();
  const server = new EmbeddableMcpServer({
    connection: injected as never,
    freshConnection: factory,
    handlersRegistry: shippedGroups(),
    // On ABAP Cloud, where the caller is asked of the system.
    systemType: 'cloud',
    logger: silent,
    backgroundRuns: strategy,
    systemContextResolver: defaultSystemContextResolver,
  });
  const client = await clientOf(server);
  return {
    server,
    strategy,
    client,
    /** The runs the strategy keeps for the instance's caller. */
    kept: () =>
      strategy.list({ url: standIn.url, client: '', user: 'EMBEDDED_USER' }),
    close: async () => {
      await client.close();
      await (built as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    },
  };
}

afterEach(() => {
  resetProcessLatchForTests();
});

describe('a background run being born', () => {
  it('closed while it connects: its logoff is asked before the connect settles, the start refused, nothing left owned', async () => {
    const events: string[] = [];
    const connect = deferred<void>();
    const fresh = heldConnection(events, connect);
    const stand = await embedder(async () => fresh);
    try {
      const call = stand.client
        .call('RuntimeRunClass', RUN)
        .catch(() => undefined);
      await until(() => events.includes('connect'));

      await closeInstance(stand.server);
      // The logoff was asked while the connect still waits.
      expect(events).toEqual(['connect', 'disconnect']);

      connect.resolve();
      await call;
      await until(() => events.includes('connected'));
      await new Promise((resolve) => setImmediate(resolve));
      // One logoff, no second; the run never kept, nothing owned.
      expect(events).toEqual(['connect', 'disconnect', 'connected']);
      expect(ownedConnections(stand.strategy)).toEqual([]);
      expect(ownedConnections().includes(fresh)).toBe(false);
      expect(stand.kept()).toEqual([]);
    } finally {
      connect.resolve();
      await stand.close();
    }
  });

  it('closed while the host’s factory builds it: never connected, ended, nothing owned', async () => {
    const events: string[] = [];
    const connect = deferred<void>();
    const fresh = heldConnection(events, connect);
    const built = deferred<IAbapConnection>();
    let asked = false;
    const stand = await embedder(async () => {
      asked = true;
      return built.promise;
    });
    try {
      const call = stand.client
        .call('RuntimeRunClass', RUN)
        .catch(() => undefined);
      await until(() => asked);

      await closeInstance(stand.server);
      built.resolve(fresh);
      await call;
      await until(() => events.includes('disconnect'));
      await new Promise((resolve) => setImmediate(resolve));
      // Nothing was sent on it: no connect, only its end.
      expect(events).toEqual(['disconnect']);
      expect(stand.kept()).toEqual([]);
      expect(ownedConnections(stand.strategy)).toEqual([]);
      expect(ownedConnections().includes(fresh)).toBe(false);
    } finally {
      connect.resolve();
      await stand.close();
    }
  });
});
