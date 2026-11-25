/**
 * A transport entry of type `DEVC` (any case, whatever its program id:
 * absent, blank, whitespace, `R3TR` or another) names a package and
 * checks that package against the allowed packages before anything is sent:
 * each `objects[]` entry of `MoveTransportObjects` and compact
 * `HandlerTransportMoveObjects`, the `object_name` of `AddTransportObject`
 * and `RemoveTransportObject`. Any other entry is not checked: the server
 * never maps an object to its package.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { parsePackageEntry } from '../../../lib/access/accessLists';
import { listedAccessChecks } from '../../../lib/access/listedAccessChecks';
import { noopLogger } from '../../../lib/handlerLogger';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type RecordingConnection,
  recordingConnection,
} from '../../helpers/recordingConnection';

const CHECKS = listedAccessChecks({
  allowedPackages: [parsePackageEntry('Z*', 'test')],
});

type Tool =
  | 'MoveTransportObjects'
  | 'HandlerTransportMoveObjects'
  | 'AddTransportObject'
  | 'RemoveTransportObject';

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

function serverFor(tool: Tool, connection: RecordingConnection) {
  if (tool !== 'HandlerTransportMoveObjects') {
    return new EmbeddableMcpServer({
      connection,
      systemType: 'onprem',
      logger: noopLogger,
      exposition: ['high'],
      accessChecks: CHECKS,
    });
  }
  const context = { connection, logger: noopLogger, systemType: 'onprem' };
  return new EmbeddableMcpServer({
    connection,
    systemType: 'onprem',
    logger: noopLogger,
    accessChecks: CHECKS,
    handlersRegistry: new CompositeHandlersRegistry([
      new CompactModifyHandlersGroup(context),
    ]),
  });
}

async function callOnce(tool: Tool, args: Record<string, unknown>) {
  const connection = recordingConnection();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'transport', version: '1' });
  await Promise.all([
    serverFor(tool, connection).connect(serverSide),
    client.connect(clientSide),
  ]);
  const result = await client.callTool({ name: tool, arguments: args });
  await client.close();
  return { answer: answerOf(result), requests: connection.requests };
}

const sentToTransport = (requests: RecordingConnection['requests']) =>
  requests.filter((request) => request.url.includes('/cts/transportrequests'));

const WORDS = (argument: string) =>
  `${argument} names a package outside the allowed packages: YFOO`;

const MOVE = { transport_number: 'A4HK900124', target_number: 'A4HK900126' };

for (const tool of [
  'MoveTransportObjects',
  'HandlerTransportMoveObjects',
] as const) {
  describe(`${tool}: DEVC entries of objects[]`, () => {
    for (const entry of [
      { object_type: 'DEVC' },
      { object_type: 'devc', pgmid: 'r3tr' },
      { object_type: ' Devc ', pgmid: 'R3TR' },
      { object_type: 'DEVC', pgmid: '' },
      { object_type: 'DEVC', pgmid: '   ' },
      { object_type: 'DEVC', pgmid: 'LIMU' },
    ]) {
      it(`refuses an outside package entry ${JSON.stringify(entry)}, nothing sent`, async () => {
        const { answer, requests } = await callOnce(tool, {
          ...MOVE,
          objects: [{ object_name: 'yfoo', position: '000001', ...entry }],
        });
        assert.equal(answer.error, 'package_not_allowed');
        assert.equal(answer.message, WORDS('objects[].object_name'));
        assert.deepEqual(requests, []);
      });
    }

    it('moves an allowed package entry', async () => {
      const { answer, requests } = await callOnce(tool, {
        ...MOVE,
        objects: [
          { object_name: 'ZFOO', object_type: 'DEVC', position: '000001' },
        ],
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(sentToTransport(requests).length > 0, JSON.stringify(requests));
    });

    it('refuses a mixed list with one outside package entry whole', async () => {
      const { answer, requests } = await callOnce(tool, {
        ...MOVE,
        objects: [
          { object_name: 'YPROG', object_type: 'PROG', position: '000001' },
          { object_name: 'ZFOO', object_type: 'DEVC', position: '000002' },
          { object_name: 'YFOO', object_type: 'DEVC', position: '000003' },
        ],
      });
      assert.equal(answer.error, 'package_not_allowed');
      assert.equal(answer.message, WORDS('objects[].object_name'));
      assert.deepEqual(requests, []);
    });

    it('does not check a PROG entry', async () => {
      const { answer, requests } = await callOnce(tool, {
        ...MOVE,
        objects: [
          { object_name: 'YPROG', object_type: 'PROG', position: '000001' },
        ],
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(sentToTransport(requests).length > 0, JSON.stringify(requests));
    });
  });
}

for (const tool of ['AddTransportObject', 'RemoveTransportObject'] as const) {
  const base = {
    transport_number: 'A4HK900124',
    ...(tool === 'RemoveTransportObject' ? { position: '000001' } : {}),
  };
  describe(`${tool}: a DEVC object`, () => {
    for (const entry of [
      { object_type: 'DEVC' },
      { object_type: 'devc', pgmid: 'r3tr' },
      { object_type: 'DEVC', pgmid: '' },
      { object_type: 'DEVC', pgmid: '   ' },
      { object_type: 'DEVC', pgmid: 'LIMU' },
    ]) {
      it(`refuses an outside package ${JSON.stringify(entry)}, nothing sent`, async () => {
        const { answer, requests } = await callOnce(tool, {
          ...base,
          object_name: 'yfoo',
          ...entry,
        });
        assert.equal(answer.error, 'package_not_allowed');
        assert.equal(answer.message, WORDS('object_name'));
        assert.deepEqual(requests, []);
      });
    }

    it('sends an allowed package', async () => {
      const { answer, requests } = await callOnce(tool, {
        ...base,
        object_name: 'ZFOO',
        object_type: 'DEVC',
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(sentToTransport(requests).length > 0, JSON.stringify(requests));
    });

    it('does not check a PROG object', async () => {
      const { answer, requests } = await callOnce(tool, {
        ...base,
        object_name: 'YPROG',
        object_type: 'PROG',
      });
      assert.notEqual(answer.error, 'package_not_allowed');
      assert.ok(sentToTransport(requests).length > 0, JSON.stringify(requests));
    });
  });
}
