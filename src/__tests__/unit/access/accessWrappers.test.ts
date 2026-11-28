/**
 * Every registered path checks a call before it takes its connection (spec
 * §3.2): a server instance (path 1), a plain registration of groups and
 * one tool of a group (paths 2 and 3), an exporter's raw entries (path 5).
 * A refused call answers the refusal, sends nothing and runs no handler; an
 * allowed one runs as without a strategy; a strategy that reads does so on
 * the call's own connection; with no strategy no `AccessCall` is built.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { IAccessChecks } from '../../../lib/access/accessChecks';
import {
  parsePackageEntry,
  parseRequestEntry,
  parseTableEntry,
} from '../../../lib/access/accessLists';
import * as checkedArguments from '../../../lib/access/checkedArguments';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import { packageTreeAccessChecks } from '../../../lib/access/packageTreeAccessChecks';
import { withoutDenied } from '../../../lib/access/withoutDenied';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { CompactBatchHandlersGroup } from '../../../lib/compact/batch/group';
import { noopLogger } from '../../../lib/handlerLogger';
import { DataHandlersGroup } from '../../../lib/handlers/groups/DataHandlersGroup';
import { HighLevelHandlersGroup } from '../../../lib/handlers/groups/HighLevelHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import {
  CompositeHandlersRegistry,
  REGISTER_TOOL_UNHELD_WORDS,
} from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { readOnlyToolNames } from '../../../lib/toolSet';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

const NAME = 'test';

/** A package's metadata document as SAP answers it: its name, no super package. */
const topPackageDocument = (name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}" adtcore:type="DEVC/K"><pak:superPackage/></pak:package>`;

afterEach(() => mock.restoreAll());

const allowedPackages = (...entries: string[]) =>
  listedAccessChecks({
    allowedPackages: entries.map((entry) => parsePackageEntry(entry, NAME)),
  });

/** The answer's text, parsed when it is JSON. */
function answerOf(result: object): {
  isError: boolean;
  body: Record<string, unknown>;
} {
  const content =
    'content' in result && Array.isArray(result.content) ? result.content : [];
  const first: unknown = content[0];
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '';
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      body = Object.fromEntries(Object.entries(parsed));
    }
  } catch {
    body = { text };
  }
  return {
    isError: 'isError' in result && result.isError === true,
    body,
  };
}

/** A client of `server`, its calls answered as `answerOf` reads them. */
async function clientOf(server: EmbeddableMcpServer | McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'access', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    call: async (name: string, args: Record<string, unknown>) =>
      answerOf(await client.callTool({ name, arguments: args })),
    close: () => client.close(),
  };
}

/** A server instance on `connection`, the full high and read tools, with `checks`. */
function instance(
  connection: RecordingConnection,
  checks: IAccessChecks | undefined,
) {
  return new EmbeddableMcpServer({
    connection,
    systemType: 'onprem',
    logger: noopLogger,
    exposition: ['readonly', 'high', 'data'],
    ...(checks !== undefined ? { accessChecks: checks } : {}),
  });
}

const PACKAGE_WORDS =
  'package_name names a package outside the allowed packages: YFOO';

describe('path 1: a server instance', () => {
  it('refuses a call outside the allowed packages before its connection', async () => {
    const connection = recordingConnection();
    const connect = mock.method(connection, 'connect');
    const client = await clientOf(instance(connection, allowedPackages('Z*')));
    const answer = await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'YFOO',
    });
    await client.close();
    assert.equal(answer.isError, true);
    assert.equal(answer.body.error, 'package_not_allowed');
    assert.equal(answer.body.message, PACKAGE_WORDS);
    assert.equal(connection.requests.length, 0);
    assert.equal(connect.mock.callCount(), 0);
  });

  it('runs an allowed call as without a strategy', async () => {
    const run = async (checks: IAccessChecks | undefined) => {
      const connection = recordingConnection();
      const client = await clientOf(instance(connection, checks));
      await client.call('GetClass', { class_name: 'ZC' });
      await client.call('CreateClass', {
        class_name: 'ZC',
        package_name: 'ZFOO',
        description: 'D',
      });
      await client.close();
      return connection.requests;
    };
    assert.deepEqual(await run(allowedPackages('Z*')), await run(undefined));
  });

  it('reads the package tree on the call’s own connection', async () => {
    const connection = recordingConnection([
      { data: topPackageDocument('ZCHILD') },
    ]);
    const client = await clientOf(
      instance(
        connection,
        packageTreeAccessChecks({
          allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
        }),
      ),
    );
    const answer = await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'ZCHILD',
    });
    await client.close();
    // ZCHILD's document names no super package: it is top level.
    assert.equal(answer.body.error, 'package_not_allowed');
    assert.ok(connection.requests.length > 0);
    assert.ok(
      connection.requests.every((request) =>
        request.url.toLowerCase().includes('/packages/'),
      ),
      JSON.stringify(connection.requests.map((r) => r.url)),
    );
  });

  it('builds no AccessCall without a strategy', async () => {
    const built = mock.method(checkedArguments, 'accessCallOf');
    const connection = recordingConnection();
    const client = await clientOf(instance(connection, undefined));
    await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'YFOO',
    });
    await client.close();
    assert.equal(built.mock.callCount(), 0);
  });

  it('builds an AccessCall with a strategy (the spy is load-bearing)', async () => {
    const built = mock.method(checkedArguments, 'accessCallOf');
    const connection = recordingConnection();
    const client = await clientOf(instance(connection, allowedPackages('Z*')));
    await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'YFOO',
    });
    await client.close();
    assert.equal(built.mock.callCount(), 1);
  });

  const MATRIX: ReadonlyArray<
    readonly [
      string,
      IAccessChecks,
      string,
      Record<string, unknown>,
      string,
      string,
    ]
  > = [
    [
      'package_not_allowed',
      allowedPackages('Z*'),
      'CreateClass',
      {
        class_name: 'ZC',
        package_name: 'YFOO',
        transport_request: 'A4HK900123',
      },
      'package_not_allowed',
      PACKAGE_WORDS,
    ],
    [
      'request_not_allowed',
      listedAccessChecks({
        allowedRequests: [parseRequestEntry('B4HK*', NAME)],
      }),
      'CreateClass',
      {
        class_name: 'ZC',
        package_name: 'ZFOO',
        transport_request: 'A4HK900123',
      },
      'request_not_allowed',
      'transport_request names a request outside the allowed requests: A4HK900123',
    ],
    [
      'table_not_allowed',
      listedAccessChecks({ deniedTables: [parseTableEntry('MARA', NAME)] }),
      'GetTableContents',
      { table_name: 'MARA', background: false },
      'table_not_allowed',
      'the data of MARA is not readable through this server',
    ],
    [
      'a package create outside the subtree',
      packageTreeAccessChecks({
        allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
      }),
      'CreatePackage',
      { package_name: 'ZNEW', super_package: 'YROOT', description: 'D' },
      'package_not_allowed',
      'package_name names a package outside the allowed packages: ZNEW',
    ],
  ];
  for (const [what, checks, tool, args, code, words] of MATRIX) {
    it(`refuses ${what}: the words, no handler, nothing of the call sent`, async () => {
      // A package create outside the subtree reads its parent, YROOT: a
      // top-level package.
      const connection = recordingConnection(
        tool === 'CreatePackage' ? [{ data: topPackageDocument('YROOT') }] : [],
      );
      const client = await clientOf(instance(connection, checks));
      const answer = await client.call(tool, args);
      await client.close();
      assert.equal(answer.body.error, code);
      assert.equal(answer.body.message, words);
      assert.ok(
        connection.requests.every((request) =>
          request.url.toLowerCase().includes('/packages/'),
        ),
      );
    });
  }

  it('in batch mode, a refused call takes no batch number', async () => {
    const connection = recordingConnection();
    const batch = new InstanceBatch({ keepRawParts: false });
    const context = { connection, logger: noopLogger, systemType: 'onprem' };
    const server = new EmbeddableMcpServer({
      connection,
      systemType: 'onprem',
      logger: noopLogger,
      batch,
      accessChecks: allowedPackages('Z*'),
      handlersRegistry: new CompositeHandlersRegistry([
        new CompactModifyHandlersGroup(context),
        new CompactBatchHandlersGroup(context),
      ]),
    });
    const client = await clientOf(server);
    const begun = await client.call('HandlerBatch', { action: 'begin' });
    assert.equal(begun.isError, false);
    const numbered = mock.method(batch, 'nextNumber');
    const answer = await client.call('HandlerCreate', {
      object_type: 'CLASS',
      class_name: 'ZC',
      package_name: 'YFOO',
    });
    assert.equal(answer.body.error, 'package_not_allowed');
    assert.equal(numbered.mock.callCount(), 0);
    await client.call('HandlerCreate', {
      object_type: 'CLASS',
      class_name: 'ZC',
      package_name: 'ZFOO',
      description: 'D',
    });
    assert.equal(numbered.mock.callCount(), 1);
    await client.close();
  });

  it('refuses package_tree_unreadable when the tree cannot be read', async () => {
    const connection = recordingConnection();
    mock.method(connection, 'makeAdtRequest', async () => {
      throw new Error('the system is not reachable');
    });
    const client = await clientOf(
      instance(
        connection,
        packageTreeAccessChecks({
          allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
        }),
      ),
    );
    const answer = await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'ZOTHER',
    });
    await client.close();
    assert.equal(answer.body.error, 'package_tree_unreadable');
    assert.equal(
      answer.body.message,
      'the package tree above ZOTHER could not be read, so package_name is not checked against the allowed packages',
    );
  });
});

/**
 * A package's lock, unlock and update are checked by the package itself —
 * `object_name` with `object_type` `PACKAGE`, `package_name` on the update —
 * and a lock's `super_package`, which the lock never sends, reaches no
 * check: a package outside the allowed packages is refused with and without
 * it, and an allowed one locks.
 */
describe('a package is checked by its own name', () => {
  /** A server instance serving the compact write tools, with `checks`. */
  function compactInstance(
    connection: RecordingConnection,
    checks: IAccessChecks,
  ) {
    const context = { connection, logger: noopLogger, systemType: 'onprem' };
    return new EmbeddableMcpServer({
      connection,
      systemType: 'onprem',
      logger: noopLogger,
      accessChecks: checks,
      handlersRegistry: new CompositeHandlersRegistry([
        new CompactModifyHandlersGroup(context),
      ]),
    });
  }

  /** Stands for the handle the case's own lock of an allowed package answered. */
  const HELD = '<held>';

  const OBJECT_WORDS =
    'object_name names a package outside the allowed packages: YFOO';

  const REFUSED: ReadonlyArray<
    readonly [string, string, Record<string, unknown>, string]
  > = [
    [
      'a lock without super_package',
      'HandlerLock',
      { object_type: 'PACKAGE', object_name: 'YFOO' },
      OBJECT_WORDS,
    ],
    [
      'a lock with an allowed super_package',
      'HandlerLock',
      { object_type: 'PACKAGE', object_name: 'YFOO', super_package: 'ZROOT' },
      OBJECT_WORDS,
    ],
    [
      'an unlock',
      'HandlerLock',
      {
        action: 'unlock',
        object_type: 'PACKAGE',
        object_name: 'YFOO',
        lock_handle: HELD,
      },
      OBJECT_WORDS,
    ],
    [
      'an update',
      'HandlerUpdate',
      {
        object_type: 'PACKAGE',
        package_name: 'YFOO',
        source_code: '<pak:package/>',
        lock_handle: HELD,
      },
      PACKAGE_WORDS,
    ],
  ];

  for (const [what, tool, args, words] of REFUSED) {
    it(`refuses ${what} of a package outside the allowed packages, sending nothing more`, async () => {
      const connection = recordingConnection();
      const client = await clientOf(
        compactInstance(connection, allowedPackages('Z*')),
      );
      // A handle this instance holds: the lock of an allowed package.
      const locked = await client.call('HandlerLock', {
        object_type: 'PACKAGE',
        object_name: 'ZHELD',
      });
      const handle = locked.body.lock_handle;
      assert.equal(typeof handle, 'string', JSON.stringify(locked.body));
      const before = connection.requests.length;
      const answer = await client.call(
        tool,
        Object.fromEntries(
          Object.entries(args).map(([key, value]) => [
            key,
            value === HELD ? handle : value,
          ]),
        ),
      );
      await client.close();
      assert.equal(
        answer.body.error,
        'package_not_allowed',
        JSON.stringify(answer.body),
      );
      assert.equal(answer.body.message, words);
      assert.equal(connection.requests.length, before);
    });
  }

  it('locks an allowed package, its super_package left unchecked', async () => {
    const connection = recordingConnection();
    const client = await clientOf(
      compactInstance(connection, allowedPackages('Z*')),
    );
    const answer = await client.call('HandlerLock', {
      object_type: 'PACKAGE',
      object_name: 'ZFOO',
      super_package: 'YROOT',
    });
    await client.close();
    assert.equal(answer.isError, false, JSON.stringify(answer.body));
    assert.ok(
      connection.requests.some((request) =>
        request.url.includes('/packages/zfoo?_action=LOCK'),
      ),
    );
  });

  it('locks an object of another type by its name, checking no package', async () => {
    const connection = recordingConnection();
    const client = await clientOf(
      compactInstance(connection, allowedPackages('Z*')),
    );
    const answer = await client.call('HandlerLock', {
      object_type: 'CLASS',
      object_name: 'YCL_FOO',
    });
    await client.close();
    assert.equal(answer.isError, false, JSON.stringify(answer.body));
  });

  it('leaves a package check unchecked: it is a read, served by the read-only sets', async () => {
    const connection = recordingConnection();
    const client = await clientOf(instance(connection, allowedPackages('Z*')));
    const answer = await client.call('CheckPackage', {
      package_name: 'YFOO',
      super_package: 'YROOT',
    });
    await client.close();
    assert.notEqual(answer.body.error, 'package_not_allowed');
  });
});

/** Groups on `connection`, their context carrying `checks`. */
function groupsOn(connection: RecordingConnection, checks: IAccessChecks) {
  const context = {
    connection,
    logger: noopLogger,
    systemType: 'onprem',
    accessChecks: { checks, readOnly: readOnlyToolNames() },
  };
  return [new HighLevelHandlersGroup(context), new DataHandlersGroup(context)];
}

describe('paths 2 and 3: a plain registration', () => {
  it('path 2: refuses before the call’s context', async () => {
    const connection = recordingConnection();
    const server = new McpServer({ name: 'plain', version: '1' });
    new CompositeHandlersRegistry(
      groupsOn(connection, allowedPackages('Z*')),
    ).registerAllTools(server);
    const client = await clientOf(server);
    const answer = await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'YFOO',
    });
    await client.close();
    assert.equal(answer.isError, true);
    assert.equal(answer.body.error, 'package_not_allowed');
    assert.equal(connection.requests.length, 0);
  });

  it('path 3: one tool of a group, refused the same way', async () => {
    const connection = recordingConnection();
    const server = new McpServer({ name: 'one', version: '1' });
    const groups = groupsOn(connection, allowedPackages('Z*'));
    const registry = new CompositeHandlersRegistry(groups);
    const entry = groups
      .flatMap((group) => group.getHandlers())
      .find((each) => each.toolDefinition.name === 'CreateClass');
    assert.ok(entry !== undefined);
    registry.registerTool(server, entry);
    const client = await clientOf(server);
    const answer = await client.call('CreateClass', {
      class_name: 'ZC',
      package_name: 'YFOO',
    });
    await client.close();
    assert.equal(answer.body.error, 'package_not_allowed');
    assert.equal(connection.requests.length, 0);
  });

  it('path 3: a denied tool is held by no group', () => {
    const groups = groupsOn(recordingConnection(), allowedPackages('Z*'));
    const entry = groups
      .flatMap((group) => group.getHandlers())
      .find((each) => each.toolDefinition.name === 'DeleteClass');
    assert.ok(entry !== undefined);
    const registry = new CompositeHandlersRegistry(
      withoutDenied(groups, [parseDeniedEntry('DeleteClass', NAME)]),
    );
    assert.throws(
      () =>
        registry.registerTool(
          new McpServer({ name: 'x', version: '1' }),
          entry,
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === REGISTER_TOOL_UNHELD_WORDS('DeleteClass'),
    );
  });
});

describe('path 5: an exporter’s raw entries', () => {
  it('refuses before the handler, on the connection given', async () => {
    const exporter = new HandlerExporter({
      accessChecks: allowedPackages('Z*'),
      systemType: 'onprem',
    });
    const entry = exporter
      .getHandlerEntries()
      .find((each) => each.toolDefinition.name === 'CreateClass');
    assert.ok(entry !== undefined);
    const connection = recordingConnection();
    const answer = answerOf(
      Object(
        await entry.call(
          { connection, logger: noopLogger },
          { class_name: 'ZC', package_name: 'YFOO' },
        ),
      ),
    );
    assert.equal(answer.body.error, 'package_not_allowed');
    assert.equal(connection.requests.length, 0);
  });

  it('a non-string package is the schema’s refusal, as without a strategy', async () => {
    const exporter = new HandlerExporter({
      accessChecks: allowedPackages('Z*'),
      systemType: 'onprem',
    });
    const entry = exporter
      .getHandlerEntries()
      .find((each) => each.toolDefinition.name === 'CreateClass');
    assert.ok(entry !== undefined);
    const connection = recordingConnection();
    await assert.rejects(
      entry.call(
        { connection, logger: noopLogger },
        { class_name: 'ZC', package_name: 42 },
      ),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith('Input validation error'),
    );
    assert.equal(connection.requests.length, 0);
  });
});
