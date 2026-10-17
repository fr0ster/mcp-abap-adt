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
  connect: jest.Mock;
  disconnect: jest.Mock;
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
    connect: jest.fn(async () => {}),
    setSessionType: jest.fn(),
    getConfig: () => ({
      url: 'https://sap.example.invalid',
      client: '100',
      connectionType: 'rfc',
    }),
    disconnect: jest.fn(async () => {}),
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
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  jest.restoreAllMocks();
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

describe.each(SITES)('%s', (_label, tool, args) => {
  it('SAP accepts it: its fresh connection is disconnected once, no request of it carries a signal', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);
    try {
      // SAP accepts every request (how the tool reads the stand-in's empty
      // answers is not the point here).
      await client.callTool({ name: tool, arguments: args });
      expect(factory.calls).toEqual([[]]);
      const fresh = factory.made[0] as FakeRfc;
      expect(fresh.sent.length).toBeGreaterThan(0);
      expect(fresh.sent.filter((s) => s.signal)).toEqual([]);
      expect(fresh.disconnect).toHaveBeenCalledTimes(1);
      expect(injected.sent).toEqual([]);
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
      expect(result.isError).toBe(true);
      expect(factory.calls).toEqual([[]]);
      const fresh = factory.made[0] as FakeRfc;
      expect(fresh.sent.length).toBeGreaterThan(0);
      expect(fresh.sent.filter((s) => s.signal)).toEqual([]);
      expect(fresh.disconnect).toHaveBeenCalledTimes(1);
      expect(injected.sent).toEqual([]);
    } finally {
      await client.close();
    }
  });
});

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
    expect(typeof handle).toBe('string');
    expect(factory.made).toHaveLength(1);
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
      name: 'HandlerUnlock',
      arguments: {
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
      expect(session.disconnect).not.toHaveBeenCalled();

      const updated = await update(client, handle);
      expect(updated.isError).toBeFalsy();
      // On the lock's session, nothing on the injected one, no new session.
      expect(session.sent.filter(isWrite)).toHaveLength(1);
      expect(session.disconnect).not.toHaveBeenCalled();
      expect(factory.made).toHaveLength(1);

      await unlock(client, handle);
      expect(session.sent.filter(isUnlock)).toHaveLength(1);
      expect(session.sent.findIndex(isUnlock)).toBeGreaterThan(
        session.sent.findIndex(isWrite),
      );
      expect(session.disconnect).toHaveBeenCalledTimes(1);
      expect(session.sent.filter((s) => s.signal)).toEqual([]);
      expect(injected.sent).toEqual([]);
      expect(factory.made).toHaveLength(1);
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
      expect(updated.isError).toBe(true);
      expect(session.sent.filter(isWrite)).toHaveLength(1);
      expect(session.disconnect).not.toHaveBeenCalled();

      await unlock(client, handle);
      expect(session.sent.filter(isUnlock)).toHaveLength(1);
      expect(session.disconnect).toHaveBeenCalledTimes(1);
      expect(session.sent.filter((s) => s.signal)).toEqual([]);
      expect(injected.sent).toEqual([]);
      expect(factory.made).toHaveLength(1);
    } finally {
      await client.close();
    }
  });
});
