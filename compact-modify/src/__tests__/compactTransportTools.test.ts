/**
 * `HandlerTransportSortAndCompress` and `HandlerTransportMoveObjects` are the
 * full set's `SortAndCompressTransportTask` and `MoveTransportObjects` under
 * compact's names: the same handler, so the same request on the wire and the
 * same answer; the same parameters, without the full set's `detail`.
 *
 * Both run the real client over a recording connection, as the full tools'
 * own test does, and each pair is compared whole.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import {
  handleMoveTransportObjects,
  handleSortAndCompressTransportTask,
} from '@mcp-abap-adt/lib/handlers/write';
import {
  type JsonSchema,
  listedJson,
} from '../../../src/__tests__/helpers/listedJson';
import { TOOL_DEFINITION as FullMove } from '../../../src/handlers/transport/high/handleMoveTransportObjects';
import { TOOL_DEFINITION as FullSort } from '../../../src/handlers/transport/high/handleSortAndCompressTransportTask';
import { compactModifyEntries } from '../group';
import {
  TOOL_DEFINITION as CompactMove,
  handleHandlerTransportMoveObjects,
} from '../handlers/handleHandlerTransportMoveObjects';
import {
  TOOL_DEFINITION as CompactSort,
  handleHandlerTransportSortAndCompress,
} from '../handlers/handleHandlerTransportSortAndCompress';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string; data?: unknown };

/** A connection that records every request and answers `200` with `body`. */
function recording(body = '') {
  const sent: Sent[] = [];
  const connection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest(options: Sent) {
      sent.push({
        method: options.method,
        url: options.url,
        data: options.data,
      });
      return { status: 200, statusText: 'OK', headers: {}, data: body };
    },
  };
  return { context: { connection, logger: undefined } as never, sent };
}

const SOURCE = 'SIDK900101';
const TARGET = 'SIDK900102';
const OBJECTS = [
  { object_name: 'ZCL_A', object_type: 'CLAS', position: '000001' },
  {
    object_name: 'ZTAB',
    object_type: 'TABL',
    position: '000002',
    pgmid: 'R3TR',
  },
];

/**
 * The full tool's answer as compact words it: the one sentence that names the
 * full set's read names `HandlerGet` with `object_type: TRANSPORT` instead.
 */
function asCompact(answer: { content: { type: string; text: string }[] }) {
  return {
    ...answer,
    content: answer.content.map((part) => ({
      ...part,
      text: part.text.replaceAll(
        'ReadTransportObjects',
        'HandlerGet with object_type TRANSPORT',
      ),
    })),
  };
}

/** The full tool's schema without `detail`, which compact does not offer. */
function withoutDetail(schema: JsonSchema): JsonSchema {
  const { detail: _detail, ...properties } = schema.properties ?? {};
  return { ...schema, properties };
}

describe('the compact transport sort and move tools', () => {
  it('are registered in compact-modify under their compact names', () => {
    const names = compactModifyEntries().map((e) => e.toolDefinition.name);
    for (const name of [
      'HandlerTransportSortAndCompress',
      'HandlerTransportMoveObjects',
    ]) {
      assert.ok(names.some((e) => isDeepStrictEqual(e, name)));
    }
    assert.equal(CompactSort.name, 'HandlerTransportSortAndCompress');
    assert.equal(CompactMove.name, 'HandlerTransportMoveObjects');
  });

  it("take the full tools' parameters, without detail, where the full tools run", () => {
    assert.deepStrictEqual(
      listedJson(CompactSort.inputSchema),
      withoutDetail(listedJson(FullSort.inputSchema)),
    );
    assert.deepStrictEqual(
      listedJson(CompactMove.inputSchema),
      withoutDetail(listedJson(FullMove.inputSchema)),
    );
    assert.deepStrictEqual(CompactSort.available_in, FullSort.available_in);
    assert.deepStrictEqual(CompactMove.available_in, FullMove.available_in);
  });

  it('sort and compress: the same request and the same answer as the full tool', async () => {
    const compact = recording();
    const full = recording();
    const args = { transport_number: SOURCE };

    const compactAnswer = await handleHandlerTransportSortAndCompress(
      compact.context,
      args,
    );
    const fullAnswer = await handleSortAndCompressTransportTask(
      full.context,
      args,
    );

    assert.equal(compact.sent.length, 1);
    assert.equal(
      compact.sent[0]?.url,
      `/sap/bc/adt/cts/transportrequests/${SOURCE}/sortandcompress`,
    );
    assert.deepStrictEqual(compact.sent, full.sent);
    assert.ok(JSON.stringify(fullAnswer).includes('ReadTransportObjects'));
    assert.ok(!JSON.stringify(compactAnswer).includes('ReadTransportObjects'));
    assert.ok(
      JSON.stringify(compactAnswer).includes(
        `HandlerGet with object_type TRANSPORT on ${SOURCE}`,
      ),
    );
    assert.deepStrictEqual(compactAnswer, asCompact(fullAnswer));
    assert.equal(compactAnswer.isError, false);
  });

  it('move objects: the same request and the same answer as the full tool', async () => {
    const compact = recording();
    const full = recording();
    const args = {
      transport_number: SOURCE,
      target_number: TARGET,
      objects: OBJECTS,
    };

    const compactAnswer = await handleHandlerTransportMoveObjects(
      compact.context,
      args,
    );
    const fullAnswer = await handleMoveTransportObjects(full.context, args);

    assert.equal(compact.sent.length, 1);
    assert.equal(compact.sent[0]?.method, 'POST');
    assert.ok(String(compact.sent[0]?.data).includes(TARGET));
    assert.deepStrictEqual(compact.sent, full.sent);
    assert.ok(!JSON.stringify(compactAnswer).includes('ReadTransportObjects'));
    assert.ok(
      JSON.stringify(compactAnswer).includes(
        `HandlerGet with object_type TRANSPORT on ${SOURCE} and on ${TARGET}`,
      ),
    );
    assert.deepStrictEqual(compactAnswer, asCompact(fullAnswer));
    assert.equal(compactAnswer.isError, false);
  });

  it('name no other tool in their descriptions', () => {
    for (const tool of [CompactSort, CompactMove]) {
      assert.ok(!tool.description.includes('ReadTransportObjects'));
      assert.ok(!tool.description.includes('HandlerGet'));
    }
  });

  it('refuse a missing argument in the full tools’ words, sending nothing', async () => {
    const sort = recording();
    const move = recording();

    const sortRefused = await handleHandlerTransportSortAndCompress(
      sort.context,
      {} as never,
    );
    const moveRefused = await handleHandlerTransportMoveObjects(move.context, {
      transport_number: SOURCE,
      target_number: TARGET,
      objects: [],
    });

    assert.equal(sortRefused.isError, true);
    assert.ok(
      JSON.stringify(sortRefused).includes('transport_number is required'),
    );
    assert.equal(moveRefused.isError, true);
    assert.ok(
      JSON.stringify(moveRefused).includes(
        'objects must hold at least one entry',
      ),
    );
    assert.deepStrictEqual(sort.sent, []);
    assert.deepStrictEqual(move.sent, []);
  });
});
