/**
 * `HandlerTransportSortAndCompress` and `HandlerTransportMoveObjects` are the
 * full set's `SortAndCompressTransportTask` and `MoveTransportObjects` under
 * compact's names: the same handler, so the same request on the wire and the
 * same answer; the same parameters, without the full set's `detail`.
 *
 * Both run the real client over a recording connection, as the full tools'
 * own test does, and each pair is compared whole.
 */
import {
  handleMoveTransportObjects,
  handleSortAndCompressTransportTask,
} from '@mcp-abap-adt/lib/handlers/write';
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
function withoutDetail(schema: {
  properties: Record<string, unknown>;
  required: readonly string[];
}) {
  const { detail: _detail, ...properties } = schema.properties;
  return { ...schema, properties };
}

describe('the compact transport sort and move tools', () => {
  it('are registered in compact-modify under their compact names', () => {
    const names = compactModifyEntries(() => ({}) as never).map(
      (e) => e.toolDefinition.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'HandlerTransportSortAndCompress',
        'HandlerTransportMoveObjects',
      ]),
    );
    expect(CompactSort.name).toBe('HandlerTransportSortAndCompress');
    expect(CompactMove.name).toBe('HandlerTransportMoveObjects');
  });

  it("take the full tools' parameters, without detail, where the full tools run", () => {
    expect(CompactSort.inputSchema).toEqual(
      withoutDetail(FullSort.inputSchema),
    );
    expect(CompactMove.inputSchema).toEqual(
      withoutDetail(FullMove.inputSchema),
    );
    expect(CompactSort.available_in).toEqual(FullSort.available_in);
    expect(CompactMove.available_in).toEqual(FullMove.available_in);
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

    expect(compact.sent).toHaveLength(1);
    expect(compact.sent[0]?.url).toBe(
      `/sap/bc/adt/cts/transportrequests/${SOURCE}/sortandcompress`,
    );
    expect(compact.sent).toEqual(full.sent);
    expect(JSON.stringify(fullAnswer)).toContain('ReadTransportObjects');
    expect(JSON.stringify(compactAnswer)).not.toContain('ReadTransportObjects');
    expect(JSON.stringify(compactAnswer)).toContain(
      `HandlerGet with object_type TRANSPORT on ${SOURCE}`,
    );
    expect(compactAnswer).toEqual(asCompact(fullAnswer));
    expect(compactAnswer.isError).toBe(false);
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

    expect(compact.sent).toHaveLength(1);
    expect(compact.sent[0]?.method).toBe('POST');
    expect(String(compact.sent[0]?.data)).toContain(TARGET);
    expect(compact.sent).toEqual(full.sent);
    expect(JSON.stringify(compactAnswer)).not.toContain('ReadTransportObjects');
    expect(JSON.stringify(compactAnswer)).toContain(
      `HandlerGet with object_type TRANSPORT on ${SOURCE} and on ${TARGET}`,
    );
    expect(compactAnswer).toEqual(asCompact(fullAnswer));
    expect(compactAnswer.isError).toBe(false);
  });

  it('name HandlerGet, not the full read, in their descriptions', () => {
    for (const tool of [CompactSort, CompactMove]) {
      expect(tool.description).not.toContain('ReadTransportObjects');
      expect(tool.description).toContain('HandlerGet');
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

    expect(sortRefused.isError).toBe(true);
    expect(JSON.stringify(sortRefused)).toContain(
      'transport_number is required',
    );
    expect(moveRefused.isError).toBe(true);
    expect(JSON.stringify(moveRefused)).toContain(
      'objects must hold at least one entry',
    );
    expect(sort.sent).toEqual([]);
    expect(move.sent).toEqual([]);
  });
});
