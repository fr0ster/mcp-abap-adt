/**
 * An activation that names a package (`objects[]` entries, compact
 * `HandlerActivate`'s single form) checks that package against the allowed
 * packages before the activation is sent: every spelling the activation
 * reads as `DEVC/K` (the code in either case, the main type `DEVC`, the
 * name `package`, compact `object_type` `PACKAGE` — the schema takes that
 * one in upper case only). A non-package entry is
 * not checked: the server makes no call to find an object's package.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { TOOL_DEFINITION as ActivateObjectLow } from '../../../handlers/common/low/handleActivateObject';
import type { IAccessChecks } from '../../../lib/access/accessChecks';
import { parsePackageEntry } from '../../../lib/access/accessLists';
import {
  accessCallOf,
  checkedArgumentsOf,
} from '../../../lib/access/checkedArguments';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import { noopLogger } from '../../../lib/handlerLogger';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

const NAME = 'test';

const allowedPackages = (...entries: string[]) =>
  listedAccessChecks({
    allowedPackages: entries.map((entry) => parsePackageEntry(entry, NAME)),
  });

type Tool = 'ActivateObjects' | 'HandlerActivate';

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

function serverFor(
  tool: Tool,
  connection: RecordingConnection,
  checks: IAccessChecks,
) {
  if (tool === 'ActivateObjects') {
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

async function callOnce(tool: Tool, args: Record<string, unknown>) {
  const connection = recordingConnection();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'activation', version: '1' });
  await Promise.all([
    serverFor(tool, connection, allowedPackages('Z*')).connect(serverSide),
    client.connect(clientSide),
  ]);
  const result = await client.callTool({ name: tool, arguments: args });
  await client.close();
  return { answer: answerOf(result), requests: connection.requests };
}

const activations = (requests: RecordingConnection['requests']) =>
  requests.filter((request) => request.url.includes('/activation'));

const OUTSIDE_WORDS = (argument: string) =>
  `${argument} names a package outside the allowed packages: YFOO`;

for (const tool of ['ActivateObjects', 'HandlerActivate'] as const) {
  describe(`${tool}: package entries of objects[]`, () => {
    for (const type of ['DEVC/K', 'devc/k', 'DEVC', 'devc', 'package']) {
      it(`refuses an outside package typed ${type}, nothing sent`, async () => {
        const { answer, requests } = await callOnce(tool, {
          objects: [{ name: 'yfoo', type }],
        });
        assert.equal(answer.error, 'package_not_allowed');
        assert.equal(answer.message, OUTSIDE_WORDS('objects[].name'));
        assert.deepEqual(requests, []);
      });
    }

    it('activates an allowed package', async () => {
      const { answer, requests } = await callOnce(tool, {
        objects: [{ name: 'ZFOO', type: 'DEVC/K' }],
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(activations(requests).length > 0, JSON.stringify(requests));
    });

    it('refuses a mixed list with one outside package whole', async () => {
      const { answer, requests } = await callOnce(tool, {
        objects: [
          { name: 'ZCL_A', type: 'CLAS/OC' },
          { name: 'ZFOO', type: 'DEVC/K' },
          { name: 'YFOO', type: 'DEVC/K' },
        ],
      });
      assert.equal(answer.error, 'package_not_allowed');
      assert.equal(answer.message, OUTSIDE_WORDS('objects[].name'));
      assert.deepEqual(requests, []);
    });

    it('does not check a class entry', async () => {
      const { answer, requests } = await callOnce(tool, {
        objects: [
          { name: 'YCL_OUTSIDE', type: 'CLAS/OC' },
          { name: 'YCL_OTHER', type: 'class' },
        ],
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(activations(requests).length > 0, JSON.stringify(requests));
    });
  });
}

describe('HandlerActivate: the single form', () => {
  for (const args of [
    { object_type: 'PACKAGE', object_name: 'yfoo' },
    { object_adt_type: 'DEVC/K', object_name: 'YFOO' },
    { object_adt_type: 'devc', object_name: 'YFOO' },
  ]) {
    it(`refuses an outside package: ${JSON.stringify(args)}`, async () => {
      const { answer, requests } = await callOnce('HandlerActivate', args);
      assert.equal(answer.error, 'package_not_allowed');
      assert.equal(answer.message, OUTSIDE_WORDS('object_name'));
      assert.deepEqual(requests, []);
    });
  }

  it('activates an allowed package', async () => {
    const { answer, requests } = await callOnce('HandlerActivate', {
      object_type: 'PACKAGE',
      object_name: 'ZFOO',
    });
    assert.notEqual(answer.error, 'package_not_allowed');
    assert.ok(activations(requests).length > 0, JSON.stringify(requests));
  });

  it('does not check a class', async () => {
    const { answer, requests } = await callOnce('HandlerActivate', {
      object_type: 'CLASS',
      object_name: 'YCL_OUTSIDE',
    });
    assert.notEqual(answer.error, 'package_not_allowed');
    assert.ok(requests.length > 0, JSON.stringify(requests));
  });

  it('reads objects[] first, as the handler does: object_name beside it is not sent', async () => {
    const { answer, requests } = await callOnce('HandlerActivate', {
      objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }],
      object_type: 'PACKAGE',
      object_name: 'YFOO',
    });
    assert.notEqual(answer.error, 'package_not_allowed');
    assert.ok(requests.length > 0, JSON.stringify(requests));
  });
});

describe('ActivateObjectLow (registered by no shipped group)', () => {
  it('names its package entries as objects[].name', () => {
    const checked = checkedArgumentsOf(ActivateObjectLow, new Set());
    assert.ok(checked !== undefined);
    assert.deepEqual(
      accessCallOf('ActivateObjectLow', checked, {
        objects: [
          { name: 'ycl_a', type: 'CLAS/OC' },
          { name: ' yfoo ', type: 'DEVC/K' },
        ],
      })?.packages,
      [{ argument: 'objects[].name', value: 'YFOO' }],
    );
  });
});
