/**
 * The sites where a started tool works on a fresh connection of its own
 *, through an embedder whose injected connection
 * names RFC and whose host gives a `freshConnection` factory:
 *
 * (a) `CreatePackage` (high) and compact's `HandlerCreate` PACKAGE over RFC,
 * (b) the high `DeletePackage` with `force_new_connection`:
 *     the factory is called with no argument, no request on its connection
 *     carries a signal, and the connection is disconnected — once — when the
 *     tool fails because SAP refuses it, as when it succeeds;
 * (c) over RFC, `HandlerLock` → `HandlerUpdate` (`lock_handle`) →
 *     `HandlerUnlock` PACKAGE: the update is sent on the lock's own session
 *     and nothing on the injected connection; the unlock is sent on it and
 *     logs it off. A refused update changes none of that: the unlock still
 *     reaches the lock session and logs it off.
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
import { format } from 'node:util';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { CompactHandlersGroup } from '../../../lib/compact/group';
import { HighLevelHandlersGroup } from '../../../lib/handlers/groups/HighLevelHandlersGroup';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { recordingConnection } from '../../helpers/recordingConnection';

/** What SAP answers a refused request: `400` with an ADT exception document. */
const ADT_EXCEPTION =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceNoAccess"/>' +
  '<message lang="EN">The system refused the request</message></exc:exception>';

function sapRefusal(): Error {
  return Object.assign(new Error('Request failed with status code 400'), {
    isAxiosError: true,
    response: {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/xml' },
      data: ADT_EXCEPTION,
    },
  });
}

/** A package's metadata, as a read answers it. */
const PACKAGE_XML =
  '<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="before" adtcore:name="ZFRESH" ' +
  'adtcore:type="DEVC/K"></pak:package>';

interface Sent {
  method: string;
  url: string;
  /** Whether the request's options carried a `signal` key. */
  signal: boolean;
}

type FakeRfc = IAbapConnection & {
  sent: Sent[];
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => Promise<void>>;
  /** From now on every request `match` accepts is refused by SAP. */
  refuse(match: (sent: Sent) => boolean): void;
};

/** A connection whose configuration names RFC; it records every request's options. */
function rfcConnection(): FakeRfc {
  const base = recordingConnection();
  // The recording connection's own answer, kept before it is replaced below.
  const answer = base.makeAdtRequest.bind(base);
  const sent: Sent[] = [];
  const refusals: Array<(sent: Sent) => boolean> = [];
  return Object.assign(base, {
    sent,
    connect: mock.fn(async () => {}),
    setSessionType: mock.fn(),
    getConfig: () => ({
      url: 'https://sap.example.invalid',
      client: '100',
      connectionType: 'rfc',
    }),
    disconnect: mock.fn(async () => {}),
    refuse: (match: (sent: Sent) => boolean) => {
      refusals.push(match);
    },
    makeAdtRequest: async (options: IAbapRequestOptions) => {
      const one: Sent = {
        method: options.method,
        url: String(options.url),
        signal: 'signal' in options,
      };
      sent.push(one);
      if (refusals.some((match) => match(one))) throw sapRefusal();
      if (
        one.method === 'GET' &&
        one.url.toLowerCase().includes('/packages/zfresh')
      ) {
        return {
          data: PACKAGE_XML,
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      }
      return answer(options);
    },
  }) as unknown as FakeRfc;
}

interface Factory {
  (): Promise<IAbapConnection>;
  calls: unknown[][];
  made: FakeRfc[];
}

/** The host's factory: records each call's arguments and what it handed over. */
function hostFactory(prepare: (fresh: FakeRfc) => void = () => {}): Factory {
  const calls: unknown[][] = [];
  const made: FakeRfc[] = [];
  const factory = async (...args: unknown[]): Promise<IAbapConnection> => {
    calls.push(args);
    const fresh = rfcConnection();
    prepare(fresh);
    made.push(fresh);
    return fresh;
  };
  return Object.assign(factory, { calls, made });
}

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  mock.method(process.stderr, 'write', () => true);
});
afterEach(() => {
  mock.restoreAll();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function served(
  injected: IAbapConnection,
  freshConnection: () => Promise<IAbapConnection>,
): Promise<Client> {
  const context = {
    connection: null as never,
    logger: undefined,
  } as unknown as HandlerContext;
  const server = new EmbeddableMcpServer({
    connection: injected as unknown as AbapConnection,
    handlersRegistry: new CompositeHandlersRegistry([
      new HighLevelHandlersGroup(context),
      new CompactHandlersGroup(context, [
        compactReadOnlyEntries,
        compactModifyEntries,
      ]),
    ]),
    systemType: 'onprem',
    systemContextResolver: null,
    systemContext: { responsible: 'DEVELOPER', masterSystem: 'DEV' },
    freshConnection,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'substitution-sites', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content: Array<{ text: string }> }).content;
  return content.map((c) => c.text).join('\n');
}

const SITES: Array<[string, string, Record<string, unknown>]> = [
  [
    'CreatePackage (high) over RFC',
    'CreatePackage',
    { package_name: 'ZFRESH', super_package: 'ZROOT', description: 'd' },
  ],
  [
    'HandlerCreate PACKAGE over RFC',
    'HandlerCreate',
    {
      object_type: 'PACKAGE',
      package_name: 'ZFRESH',
      super_package: 'ZROOT',
      description: 'd',
    },
  ],
  [
    'DeletePackage (high) with force_new_connection',
    'DeletePackage',
    { package_name: 'ZFRESH', force_new_connection: true },
  ],
];

for (const [_label, tool, args] of SITES) {
  describe(format('%s', _label), () => {
    it('SAP accepts it: its fresh connection is disconnected once, no request of it carries a signal', async () => {
      const injected = rfcConnection();
      const factory = hostFactory();
      const client = await served(injected, factory);
      try {
        // SAP accepts every request (how the tool reads the stand-in's empty
        // answers is not the point here).
        await client.callTool({ name: tool, arguments: args });
        assert.deepStrictEqual(factory.calls, [[]]);
        const fresh = factory.made[0] as FakeRfc;
        assert.ok(fresh.sent.length > 0);
        assert.deepStrictEqual(
          fresh.sent.filter((s) => s.signal),
          [],
        );
        assert.equal(fresh.disconnect.mock.callCount(), 1);
        assert.deepStrictEqual(injected.sent, []);
      } finally {
        await client.close();
      }
    });

    it('fails, SAP refusing it: its fresh connection is disconnected once all the same, no request of it carries a signal', async () => {
      const injected = rfcConnection();
      // Every request on the fresh connection is refused.
      const factory = hostFactory((fresh) => fresh.refuse(() => true));
      const client = await served(injected, factory);
      try {
        const result = await client.callTool({ name: tool, arguments: args });
        assert.equal(result.isError, true);
        assert.deepStrictEqual(factory.calls, [[]]);
        const fresh = factory.made[0] as FakeRfc;
        assert.ok(fresh.sent.length > 0);
        assert.deepStrictEqual(
          fresh.sent.filter((s) => s.signal),
          [],
        );
        assert.equal(fresh.disconnect.mock.callCount(), 1);
        assert.deepStrictEqual(injected.sent, []);
      } finally {
        await client.close();
      }
    });
  });
}

describe('over RFC: HandlerLock → HandlerUpdate → HandlerUnlock PACKAGE', () => {
  const isUnlock = (s: Sent) => s.url.includes('_action=UNLOCK');
  const isWrite = (s: Sent) => s.method === 'PUT';

  /** Locks ZFRESH; answers its handle and the lock session. */
  async function lock(client: Client, factory: Factory) {
    const locked = await client.callTool({
      name: 'HandlerLock',
      arguments: {
        object_type: 'PACKAGE',
        object_name: 'ZFRESH',
        super_package: 'ZROOT',
      },
    });
    const handle = JSON.parse(textOf(locked)).lock_handle as string;
    assert.equal(typeof handle, 'string');
    assert.equal(factory.made.length, 1);
    return { handle, session: factory.made[0] as FakeRfc };
  }

  const update = (client: Client, handle: string) =>
    client.callTool({
      name: 'HandlerUpdate',
      arguments: {
        object_type: 'PACKAGE',
        package_name: 'ZFRESH',
        source_code: '<pak:package adtcore:description="after"/>',
        lock_handle: handle,
      },
    });

  const unlock = (client: Client, handle: string) =>
    client.callTool({
      name: 'HandlerLock',
      arguments: {
        action: 'unlock',
        object_type: 'PACKAGE',
        object_name: 'ZFRESH',
        lock_handle: handle,
      },
    });

  it('the update runs on the held lock session; the unlock is sent there and logs it off', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);
    try {
      const { handle, session } = await lock(client, factory);
      assert.equal(session.disconnect.mock.callCount(), 0);

      const updated = await update(client, handle);
      assert.ok(!updated.isError);
      // On the lock's session, nothing on the injected one, no new session.
      assert.equal(session.sent.filter(isWrite).length, 1);
      assert.equal(session.disconnect.mock.callCount(), 0);
      assert.equal(factory.made.length, 1);

      await unlock(client, handle);
      assert.equal(session.sent.filter(isUnlock).length, 1);
      assert.ok(
        session.sent.findIndex(isUnlock) > session.sent.findIndex(isWrite),
      );
      assert.equal(session.disconnect.mock.callCount(), 1);
      assert.deepStrictEqual(
        session.sent.filter((s) => s.signal),
        [],
      );
      assert.deepStrictEqual(injected.sent, []);
      assert.equal(factory.made.length, 1);
    } finally {
      await client.close();
    }
  });

  it('a refused update leaves the lock session held; the unlock still reaches it and logs it off', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);
    try {
      const { handle, session } = await lock(client, factory);
      session.refuse(isWrite);

      const updated = await update(client, handle);
      assert.equal(updated.isError, true);
      assert.equal(session.sent.filter(isWrite).length, 1);
      assert.equal(session.disconnect.mock.callCount(), 0);

      await unlock(client, handle);
      assert.equal(session.sent.filter(isUnlock).length, 1);
      assert.equal(session.disconnect.mock.callCount(), 1);
      assert.deepStrictEqual(
        session.sent.filter((s) => s.signal),
        [],
      );
      assert.deepStrictEqual(injected.sent, []);
      assert.equal(factory.made.length, 1);
    } finally {
      await client.close();
    }
  });
});
