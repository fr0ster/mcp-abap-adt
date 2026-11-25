/**
 * A unit run whose target is a package (`target.kind` `package`) checks the
 * package named in `target.name` against the allowed packages, before
 * anything is sent: `RunAbapUnit` and compact `HandlerUnitTestRun`, through
 * a server instance's own access-check path. An object target (a class, a
 * program) and the compact `tests` list (classes) are not checked: the server
 * makes no call to find an object's package. Neither tool takes a list of
 * targets: `target` is one object.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

const NAME = 'test';

/** A package's metadata document as SAP answers it: its name, no super package. */
const topPackageDocument = (name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}" adtcore:type="DEVC/K"><pak:superPackage/></pak:package>`;

const allowedPackages = (...entries: string[]) =>
  listedAccessChecks({
    allowedPackages: entries.map((entry) => parsePackageEntry(entry, NAME)),
  });

/** The answer's error code and message, when it has them. */
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

/** A server serving `tool` on `connection` with `checks`. */
function serverFor(
  tool: 'RunAbapUnit' | 'HandlerUnitTestRun',
  connection: RecordingConnection,
  checks: IAccessChecks,
) {
  if (tool === 'RunAbapUnit') {
    return new EmbeddableMcpServer({
      connection,
      systemType: 'onprem',
      logger: noopLogger,
      exposition: ['high'],
      accessChecks: checks,
    });
  }
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

/** Calls `tool` once with `args`; the answer and what was sent. */
async function callOnce(
  tool: 'RunAbapUnit' | 'HandlerUnitTestRun',
  checks: IAccessChecks,
  args: Record<string, unknown>,
  connection: RecordingConnection = recordingConnection(),
) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'unit-run', version: '1' });
  await Promise.all([
    serverFor(tool, connection, checks).connect(serverSide),
    client.connect(clientSide),
  ]);
  const result = await client.callTool({ name: tool, arguments: args });
  await client.close();
  return { answer: answerOf(result), requests: connection.requests };
}

/** Requests that reached the unit-test runner. */
const runRequests = (requests: RecordingConnection['requests']) =>
  requests.filter((request) => request.url.includes('/abapunit/'));

const PACKAGE_TARGET = (name: string) => ({
  kind: 'package',
  name,
  include_subpackages: false,
});

for (const tool of ['RunAbapUnit', 'HandlerUnitTestRun'] as const) {
  describe(`${tool}: a package target`, () => {
    it('refuses a package outside the allowed packages, nothing sent', async () => {
      const { answer, requests } = await callOnce(tool, allowedPackages('Z*'), {
        target: PACKAGE_TARGET('yfoo'),
      });
      assert.equal(answer.error, 'package_not_allowed');
      assert.equal(
        answer.message,
        'target.name names a package outside the allowed packages: YFOO',
      );
      assert.deepEqual(requests, []);
    });

    it('refuses it with include_subpackages true too: the named package is checked', async () => {
      const { answer, requests } = await callOnce(tool, allowedPackages('Z*'), {
        target: { kind: 'package', name: 'YFOO', include_subpackages: true },
      });
      assert.equal(answer.error, 'package_not_allowed');
      assert.deepEqual(requests, []);
    });

    it('runs a package inside the allowed packages', async () => {
      const { answer, requests } = await callOnce(tool, allowedPackages('Z*'), {
        target: PACKAGE_TARGET('ZFOO'),
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(runRequests(requests).length > 0, JSON.stringify(requests));
    });

    it('matches a subtree entry by reading the package tree', async () => {
      const { answer, requests } = await callOnce(
        tool,
        packageTreeAccessChecks({
          allowedPackages: [parsePackageEntry('ZFOO/**', NAME)],
        }),
        { target: PACKAGE_TARGET('ZCHILD') },
        recordingConnection([{ data: topPackageDocument('ZCHILD') }]),
      );
      // ZCHILD's document names no super package: it is top level.
      assert.equal(answer.error, 'package_not_allowed');
      assert.equal(
        answer.message,
        'target.name names a package outside the allowed packages: ZCHILD',
      );
      assert.deepEqual(runRequests(requests), []);
      assert.ok(
        requests.length > 0 &&
          requests.every((request) =>
            request.url.toLowerCase().includes('/packages/'),
          ),
        JSON.stringify(requests.map((request) => request.url)),
      );
    });

    it('does not check a class target', async () => {
      const { answer, requests } = await callOnce(tool, allowedPackages('Z*'), {
        target: { kind: 'object', name: 'YCL_OUTSIDE', type: 'CLAS/OC' },
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(runRequests(requests).length > 0, JSON.stringify(requests));
    });
  });
}

describe('HandlerUnitTestRun: the tests list', () => {
  it('names classes only and is not checked', async () => {
    const { answer, requests } = await callOnce(
      'HandlerUnitTestRun',
      allowedPackages('Z*'),
      {
        tests: [
          { container_class: 'ZCL_INSIDE', test_class: 'LTCL_A' },
          { container_class: 'YCL_OUTSIDE', test_class: 'LTCL_B' },
        ],
      },
    );
    assert.notEqual(answer.error, 'package_not_allowed');
    assert.ok(runRequests(requests).length > 0, JSON.stringify(requests));
  });
});
