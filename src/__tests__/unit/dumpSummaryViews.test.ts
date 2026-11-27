/**
 * #396: `RuntimeGetDumpById` never answers an empty success.
 *
 * The summary is read from the default view's `dump:dump` root alone. The
 * other two views are an HTML fragment and plain text, labelled in the logon
 * language (`tests/fixtures/adt/dump-views-cloud--*`, recorded on ABAP cloud
 * 2026-11-27): they name no summary field a reading can rely on. So the
 * summary is asked with `view: default` only; with `summary` or `formatted`,
 * a `response_mode` asking for it (`summary`, `both`) is refused before any
 * request, naming the view, and an absent `response_mode` follows the view
 * (`both` for `default`, `payload` for the others).
 *
 * Every view × `response_mode` is replayed against the view's own recorded
 * answer, and the two defaults through the tool's own schema, as the server
 * parses a call.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { mockModuleExports } from '../helpers/moduleMock';

// adt-clients replaced for this file before any module under test loads.
const AdtRuntimeClientMock = mock.fn<(...args: any[]) => any>(
  function AdtRuntimeClient() {
    return { getDumps: () => dumps };
  },
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  AdtRuntimeClient: AdtRuntimeClientMock,
});

import {
  handleRuntimeGetDumpById,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleRuntimeGetDumpById';
import { parseRuntimePayloadToJson } from '../../handlers/system/readonly/runtimePayloadParser';
import { corpusBody } from '../helpers/adtCorpus';
import { okResponse } from '../helpers/fakeClient';

type View = 'default' | 'summary' | 'formatted';
type Mode = 'payload' | 'summary' | 'both';

const RECORDED: Record<View, string> = {
  default: corpusBody('dump-views-cloud--01-default'),
  summary: corpusBody('dump-views-cloud--02-summary'),
  formatted: corpusBody('dump-views-cloud--03-formatted'),
};

let dumps: { getById: ReturnType<typeof mock.fn> };
const context = { connection: {} as any, logger: undefined };

beforeEach(() => {
  dumps = {
    getById: mock.fn(async (_id: string, options: { view: View }) =>
      okResponse(RECORDED[options.view]),
    ),
  };
});

const textOf = (result: any): string => result.content[0].text;
const bodyOf = (result: any): any => JSON.parse(textOf(result));

/** The summary the recorded default view names, field by field. */
const RECORDED_SUMMARY = {
  runtime_error: 'COMPUTE_INT_ZERODIVIDE',
  exception: 'CX_SY_ZERODIVIDE',
  title:
    'Runtime Error: COMPUTE_INT_ZERODIVIDE 11/26/2026 20:24:13 SAPUSER01 (00000000-0000-0000-0000-000000000000)',
  terminated_program: 'ZMCP_SHR_DUMP_CLS=============CM001',
  datetime: '2026-11-26T20:24:13Z',
  user: 'SAPUSER01',
  termination: {
    uri: '/sap/bc/adt/oo/classes/zmcp_shr_dump_cls/source/main',
    line: 15,
  },
};

async function read(view: View, response_mode?: Mode) {
  const args = TOOL_DEFINITION.inputSchema.parse({
    dump_id: 'DUMPID',
    view,
    ...(response_mode ? { response_mode } : {}),
  });
  return handleRuntimeGetDumpById(context as any, args);
}

function assertRefused(result: any, view: View) {
  assert.equal(result.isError, true, textOf(result));
  const text = textOf(result);
  assert.ok(text.includes(`view "${view}"`), text);
  assert.ok(text.includes('view "default"'), text);
  assert.equal(dumps.getById.mock.callCount(), 0, 'refused before a request');
}

describe('RuntimeGetDumpById: view × response_mode (#396)', () => {
  it('default × payload: the parsed dump, no summary', async () => {
    const answered = bodyOf(await read('default', 'payload'));
    assert.equal(answered.summary, undefined);
    assert.ok(answered.payload);
  });

  it('default × summary: the seven fields, no payload', async () => {
    const answered = bodyOf(await read('default', 'summary'));
    assert.deepStrictEqual(answered.summary, RECORDED_SUMMARY);
    assert.equal(answered.payload, undefined);
  });

  it('default × both: the summary and the parsed dump', async () => {
    const answered = bodyOf(await read('default', 'both'));
    assert.deepStrictEqual(answered.summary, RECORDED_SUMMARY);
    assert.ok(answered.payload);
  });

  for (const view of ['summary', 'formatted'] as const) {
    it(`${view} × payload: the view's document, no summary`, async () => {
      const result: any = await read(view, 'payload');
      assert.notEqual(result.isError, true, textOf(result));
      const answered = bodyOf(result);
      assert.equal(answered.view, view);
      assert.equal(answered.summary, undefined);
      assert.deepStrictEqual(
        answered.payload,
        parseRuntimePayloadToJson(RECORDED[view]),
      );
    });

    for (const mode of ['summary', 'both'] as const) {
      it(`${view} × ${mode}: refused, naming the view`, async () => {
        assertRefused(await read(view, mode), view);
      });
    }
  }
});

describe('RuntimeGetDumpById: response_mode not given (#396)', () => {
  it('is left absent by the schema, so the handler can tell it was not given', () => {
    const args = TOOL_DEFINITION.inputSchema.parse({
      dump_id: 'DUMPID',
      view: 'summary',
    });
    assert.equal(args.response_mode, undefined);
  });

  it('view default: both', async () => {
    const answered = bodyOf(await read('default'));
    assert.deepStrictEqual(answered.summary, RECORDED_SUMMARY);
    assert.ok(answered.payload);
  });

  it('neither view nor response_mode: view default, both', async () => {
    const args = TOOL_DEFINITION.inputSchema.parse({ dump_id: 'DUMPID' });
    const answered = bodyOf(
      await handleRuntimeGetDumpById(context as any, args),
    );
    assert.equal(answered.view, 'default');
    assert.deepStrictEqual(answered.summary, RECORDED_SUMMARY);
    assert.deepStrictEqual(
      answered.payload,
      parseRuntimePayloadToJson(RECORDED.default),
    );
  });

  for (const view of ['summary', 'formatted'] as const) {
    it(`view ${view}: payload`, async () => {
      const result: any = await read(view);
      assert.notEqual(result.isError, true, textOf(result));
      const answered = bodyOf(result);
      assert.equal(answered.summary, undefined);
      assert.deepStrictEqual(
        answered.payload,
        parseRuntimePayloadToJson(RECORDED[view]),
      );
    });
  }
});
