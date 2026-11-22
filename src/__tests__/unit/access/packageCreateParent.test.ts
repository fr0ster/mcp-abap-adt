/**
 * A package create's `super_package` must be readable when an
 * allowed-packages list is configured: SAP drops a super package it cannot
 * load and creates the package top level (`CL_PACKAGE->create_new_package`,
 * `load_package … CLEAR c_package_data-parentcl`), so a parent admitted by
 * name alone (an exact or prefix entry, or a subtree's root, matched with no
 * read) would let the package be created outside the tree it was checked
 * for. The parent is read through the call's package reader before the
 * create is sent; a parent that cannot be read is refused
 * `package_tree_unreadable`. With no list configured nothing is read.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { IAccessChecks } from '../../../lib/access/accessChecks';
import { parsePackageEntry } from '../../../lib/access/accessLists';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import { packageTreeAccessChecks } from '../../../lib/access/packageTreeAccessChecks';
import { noopLogger } from '../../../lib/handlerLogger';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../../lib/systemContext';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

// A package create carries the responsible person: the process states one.
let savedResponsible: string | undefined;
beforeEach(() => {
  savedResponsible = process.env.SAP_RESPONSIBLE;
  process.env.SAP_RESPONSIBLE = 'RESPONSIBLE_PLACEHOLDER';
  resetSystemContextCache();
  systemContextFromConfiguration();
});
afterEach(() => {
  mock.restoreAll();
  if (savedResponsible === undefined) delete process.env.SAP_RESPONSIBLE;
  else process.env.SAP_RESPONSIBLE = savedResponsible;
  resetSystemContextCache();
});

const NAME = 'test';
const prefix = () =>
  listedAccessChecks({
    allowedPackages: [parsePackageEntry('ZTEAM*', NAME)],
  });
const tree = () =>
  packageTreeAccessChecks({
    allowedPackages: [
      parsePackageEntry('ZTEAM*', NAME),
      parsePackageEntry('ZROOT/**', NAME),
    ],
  });

type Tool = 'CreatePackage' | 'HandlerCreate';

function answerOf(result: object): { error?: unknown; message?: unknown } {
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
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.fromEntries(Object.entries(parsed));
    }
  } catch {
    // not JSON: no code
  }
  return {};
}

function serverFor(
  tool: Tool,
  connection: RecordingConnection,
  checks: IAccessChecks | undefined,
) {
  const access = checks === undefined ? {} : { accessChecks: checks };
  if (tool === 'CreatePackage') {
    return new EmbeddableMcpServer({
      connection,
      systemType: 'onprem',
      logger: noopLogger,
      exposition: ['high'],
      ...access,
    });
  }
  const context = { connection, logger: noopLogger, systemType: 'onprem' };
  return new EmbeddableMcpServer({
    connection,
    systemType: 'onprem',
    logger: noopLogger,
    ...access,
    handlersRegistry: new CompositeHandlersRegistry([
      new CompactModifyHandlersGroup(context),
    ]),
  });
}

/** A package's metadata document as SAP answers it: its name and super package. */
const packageDocument = (name: string, parent = '') =>
  `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}" adtcore:type="DEVC/K"><pak:superPackage adtcore:name="${parent}"/></pak:package>`;

/** Whether `url` reads the package `name`: its path, the query left out. */
const readsPackage = (url: string, name: string) =>
  url
    .toLowerCase()
    .split('?')[0]
    ?.endsWith(`/packages/${name.toLowerCase()}`) === true;

/**
 * A connection whose package reads answer `packages`: a name with its super
 * package answers its document, `'empty'` an empty 200, `'missing'` a throw;
 * any other request as the recording connection answers it.
 */
function connectionWith(
  packages: Readonly<Record<string, string | 'empty' | 'missing'>>,
): RecordingConnection {
  const connection = recordingConnection();
  const original = connection.makeAdtRequest.bind(connection);
  mock.method(
    connection,
    'makeAdtRequest',
    async (options: IAbapRequestOptions) => {
      if (options.method.toUpperCase() === 'GET') {
        for (const [name, answer] of Object.entries(packages)) {
          if (!readsPackage(options.url, name)) continue;
          if (answer === 'missing') {
            throw new Error('404: the package does not exist');
          }
          const response = await original(options);
          return answer === 'empty'
            ? response
            : { ...response, data: packageDocument(name, answer) };
        }
      }
      return original(options);
    },
  );
  return connection;
}

const connectionWithout = (missing: string) =>
  connectionWith({ [missing]: 'missing' });

/** The super package the create's POST body names, `''` for an empty one. */
function sentParent(connection: RecordingConnection): string | undefined {
  const post = connection.requests.find(
    (request) => request.method.toUpperCase() === 'POST',
  );
  const body = typeof post?.data === 'string' ? post.data : '';
  const at = body.indexOf('superPackage');
  if (at < 0) return undefined;
  const element = body.slice(at, body.indexOf('>', at));
  const marker = 'adtcore:name="';
  const start = element.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  return element.slice(from, element.indexOf('"', from));
}

const argsOf = (tool: Tool, name: string, parent: string) =>
  tool === 'CreatePackage'
    ? {
        package_name: name,
        super_package: parent,
        description: 'D',
        transport_request: 'A4HK900123',
      }
    : {
        object_type: 'PACKAGE',
        package_name: name,
        super_package: parent,
        description: 'D',
        transport_request: 'A4HK900123',
      };

async function create(
  tool: Tool,
  connection: RecordingConnection,
  checks: IAccessChecks | undefined,
  name: string,
  parent: string,
) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'create', version: '1' });
  await Promise.all([
    serverFor(tool, connection, checks).connect(serverSide),
    client.connect(clientSide),
  ]);
  const result = await client.callTool({
    name: tool,
    arguments: argsOf(tool, name, parent),
  });
  await client.close();
  return answerOf(result);
}

/** Requests that are not reads: the create and anything after it. */
const writes = (connection: RecordingConnection) =>
  connection.requests.filter(
    (request) => request.method.toUpperCase() !== 'GET',
  );

for (const tool of ['CreatePackage', 'HandlerCreate'] as const) {
  for (const [strategy, checks, name, parent] of [
    // A prefix entry admits both names; the parent does not exist.
    ['prefix', prefix, 'ZTEAM_NEW', 'zteam_nope'],
    ['tree, a prefix entry', tree, 'ZTEAM_NEW', 'zteam_nope'],
    // A subtree's root matches by name, with no read; it does not exist.
    ['tree, the subtree root', tree, 'ZNEW', 'zroot'],
  ] as const) {
    describe(`${tool}, ${strategy}: the given super_package`, () => {
      it('refuses a parent that cannot be read, the create not sent', async () => {
        const connection = connectionWithout(parent);
        const answer = await create(tool, connection, checks(), name, parent);
        assert.equal(answer.error, 'package_tree_unreadable');
        assert.equal(
          answer.message,
          `the package tree above ${parent.toUpperCase()} could not be read, so super_package is not checked against the allowed packages`,
        );
        assert.deepEqual(writes(connection), []);
      });

      it('refuses a parent read answering an empty 200, the create not sent', async () => {
        const connection = connectionWith({ [parent]: 'empty' });
        const answer = await create(tool, connection, checks(), name, parent);
        assert.equal(answer.error, 'package_tree_unreadable');
        assert.deepEqual(writes(connection), []);
      });

      it('refuses a parent read answering another package, the create not sent', async () => {
        const connection = recordingConnection();
        const original = connection.makeAdtRequest.bind(connection);
        mock.method(
          connection,
          'makeAdtRequest',
          async (options: IAbapRequestOptions) => {
            const response = await original(options);
            return readsPackage(options.url, parent)
              ? { ...response, data: packageDocument('ZSOMETHING_ELSE') }
              : response;
          },
        );
        const answer = await create(tool, connection, checks(), name, parent);
        assert.equal(answer.error, 'package_tree_unreadable');
        assert.deepEqual(writes(connection), []);
      });

      it('sends the create under an allowed parent that is read', async () => {
        const connection = connectionWith({ [parent.toUpperCase()]: '' });
        const answer = await create(tool, connection, checks(), name, parent);
        assert.notEqual(answer.error, 'package_tree_unreadable');
        assert.notEqual(answer.error, 'package_not_allowed');
        assert.ok(
          connection.requests.some(
            (request) =>
              request.method.toUpperCase() === 'GET' &&
              readsPackage(request.url, parent),
          ),
          JSON.stringify(connection.requests.map((r) => r.url)),
        );
        assert.ok(writes(connection).length > 0);
        assert.equal(sentParent(connection), parent.toUpperCase());
      });
    });
  }

  describe(`${tool}: the parent is sent as the check read it`, () => {
    it('a parent with blanks around it is read and sent trimmed', async () => {
      const connection = connectionWith({ ZTEAM_BASE: '' });
      const answer = await create(
        tool,
        connection,
        prefix(),
        'ZTEAM_NEW',
        ' zteam_base ',
      );
      assert.notEqual(answer.error, 'package_tree_unreadable');
      assert.ok(
        connection.requests.some((request) =>
          readsPackage(request.url, 'ZTEAM_BASE'),
        ),
      );
      assert.equal(sentParent(connection), 'ZTEAM_BASE');
    });

    for (const blank of ['', '   ']) {
      it(`a parent of ${JSON.stringify(blank)} is not given: nothing read, an empty parent sent`, async () => {
        const connection = recordingConnection();
        const answer = await create(
          tool,
          connection,
          prefix(),
          'ZTEAM_NEW',
          blank,
        );
        assert.notEqual(answer.error, 'package_tree_unreadable');
        assert.equal(
          connection.requests.some(
            (request) => request.method.toUpperCase() === 'GET',
          ),
          false,
          JSON.stringify(connection.requests.map((r) => r.url)),
        );
        assert.equal(sentParent(connection), '');
      });
    }
  });

  describe(`${tool}: the subtree walk reads with the same rule`, () => {
    const subtree = () =>
      packageTreeAccessChecks({
        allowedPackages: [parsePackageEntry('ZROOT/**', NAME)],
      });

    it('places a parent whose read names it and its super package', async () => {
      const connection = connectionWith({ ZCHILD: 'ZROOT', ZROOT: '' });
      const answer = await create(
        tool,
        connection,
        subtree(),
        'ZNEW',
        'ZCHILD',
      );
      assert.notEqual(answer.error, 'package_tree_unreadable');
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(writes(connection).length > 0);
    });

    it('refuses a parent whose read answers an empty 200', async () => {
      const connection = connectionWith({ ZCHILD: 'empty' });
      const answer = await create(
        tool,
        connection,
        subtree(),
        'ZNEW',
        'ZCHILD',
      );
      assert.equal(answer.error, 'package_tree_unreadable');
      assert.deepEqual(writes(connection), []);
    });
  });

  it(`${tool}: with no list configured nothing is read for the parent`, async () => {
    const connection = recordingConnection();
    const answer = await create(
      tool,
      connection,
      undefined,
      'ZTEAM_NEW',
      'ZTEAM_NOPE',
    );
    assert.notEqual(answer.error, 'package_tree_unreadable');
    assert.equal(
      connection.requests.some((request) =>
        readsPackage(request.url, 'ZTEAM_NOPE'),
      ),
      false,
    );
    assert.ok(writes(connection).length > 0);
  });
}
