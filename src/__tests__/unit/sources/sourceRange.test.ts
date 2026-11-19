/**
 * The line range of the `Get<Type>` source reads (plan D5, owner's DO1):
 * `start_line` / `end_line` cut the source the one GET answered. ADT serves
 * no part of a source (measured on premise, 2026-11-04: `Range`, query
 * parameters and a fragment all answer `200` with the whole text), so the
 * request is the unchanged source GET and the server answers only the lines
 * asked.
 *
 * - A range is sent as the whole read's request, literally the same.
 * - Refused with no request: a line that is not a positive integer (the
 *   schema), `end_line` before `start_line` and a range with `part`
 *   `metadata` (the handler, before sending).
 * - The lines answered are exactly the lines asked, joined as SAP joined
 *   them, with no line end after the last: on SAP's CRLF text too.
 * - Refused after the one GET: a range outside the source, whose length is
 *   known only from the answer; the refusal names the source's line count.
 *
 * Each case runs the served entry on `recordingConnection`: the schema
 * parse and the real adt-clients request are part of it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { answerSourceRead } from '../../../lib/handlers/sourceRange';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject } from '../../helpers/assertions';
import { moduleInGroup } from '../../helpers/functionModuleMetadata';
import { type PinCase, recordCase } from '../../helpers/pinCases';

/** A source of five lines, as SAP answers it. */
const SOURCE = [
  'line one',
  'line two',
  'line three',
  'line four',
  'line five',
].join('\n');

/**
 * Every source read with a `source` part, and the arguments naming its
 * object; `first`, what it reads before the source, answered (a function
 * module's metadata, its group checked: #2).
 */
const READERS: ReadonlyArray<{
  tool: string;
  args: ToolArgs;
  first?: ReadonlyArray<Partial<IAdtWireResponse>>;
}> = [
  { tool: 'GetClass', args: { class_name: 'ZCL_PIN' } },
  { tool: 'GetInterface', args: { interface_name: 'ZIF_PIN' } },
  { tool: 'GetProgram', args: { program_name: 'ZPIN_PROG' } },
  { tool: 'GetInclude', args: { include_name: 'ZPIN_INCL' } },
  {
    tool: 'GetFunctionModule',
    args: { function_module_name: 'Z_PIN_FM', function_group_name: 'ZPIN_FG' },
    first: [moduleInGroup('Z_PIN_FM', 'ZPIN_FG')],
  },
  {
    tool: 'GetFunctionInclude',
    args: { function_group_name: 'ZPIN_FG', include_name: 'LZPIN_FGTOP' },
  },
  { tool: 'GetDdl', args: { ddl_name: 'ZPIN_DDL' } },
  {
    tool: 'GetMetadataExtension',
    args: { metadata_extension_name: 'ZPIN_DDLX' },
  },
  {
    tool: 'GetBehaviorDefinition',
    args: { behavior_definition_name: 'ZPIN_BDEF' },
  },
  {
    tool: 'GetBehaviorImplementation',
    args: { behavior_implementation_name: 'ZBP_PIN' },
  },
  {
    tool: 'GetServiceDefinition',
    args: { service_definition_name: 'ZPIN_SRVD' },
  },
  { tool: 'GetStructure', args: { structure_name: 'ZPIN_STRUCT' } },
  { tool: 'GetTable', args: { table_name: 'ZPIN_TABL' } },
  // A class's local includes: the outline's local components point into them.
  { tool: 'GetLocalDefinitions', args: { class_name: 'ZCL_PIN' } },
  { tool: 'GetLocalTypes', args: { class_name: 'ZCL_PIN' } },
  { tool: 'GetLocalMacros', args: { class_name: 'ZCL_PIN' } },
  { tool: 'GetLocalTestClass', args: { class_name: 'ZCL_PIN' } },
];

/** A recording of `tool` with `args`, SAP answering `first`, then `SOURCE`. */
async function read(
  tool: string,
  args: ToolArgs,
  first: ReadonlyArray<Partial<IAdtWireResponse>> = [],
) {
  const c: PinCase = {
    tool,
    variant: 'onprem',
    stand: 'recording',
    args,
    answers: [...first, { status: 200, data: SOURCE }],
    expected: 'none',
  };
  const recorded = await recordCase(c);
  const content = recorded.answer?.content[0];
  return {
    requests: recorded.requests,
    thrown: recorded.thrown,
    isError: recorded.answer?.isError,
    text: content === undefined ? '' : content.text,
  };
}

/** The answer's JSON payload, or `undefined` when it is plain text. */
function payloadOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The source an answer carries: its `source`, or the text itself. */
function sourceOf(text: string): unknown {
  const payload = payloadOf(text);
  return payload === undefined ? text : member(payload, 'source');
}

for (const { tool, args, first = [] } of READERS) {
  describe(`${tool}: a line range`, () => {
    it('sends the whole read’s one GET and answers exactly the lines asked', async () => {
      const whole = await read(tool, args, first);
      assert.equal(whole.isError, false);
      assert.equal(whole.requests.length, 1 + first.length);
      assert.equal(sourceOf(whole.text), SOURCE);

      const ranged = await read(
        tool,
        { ...args, start_line: 2, end_line: 4 },
        first,
      );
      assert.equal(ranged.isError, false);
      assert.deepStrictEqual(ranged.requests, whole.requests);
      assert.equal(sourceOf(ranged.text), 'line two\nline three\nline four');
      const payload = payloadOf(ranged.text);
      if (payload !== undefined) {
        assert.deepStrictEqual(
          {
            start_line: member(payload, 'start_line'),
            end_line: member(payload, 'end_line'),
            line_count: member(payload, 'line_count'),
          },
          { start_line: 2, end_line: 4, line_count: 5 },
        );
      }
    });

    it('start_line alone reads to the end, end_line alone from the first line', async () => {
      const tail = await read(tool, { ...args, start_line: 4 }, first);
      assert.equal(tail.isError, false);
      assert.equal(sourceOf(tail.text), 'line four\nline five');
      const head = await read(tool, { ...args, end_line: 1 }, first);
      assert.equal(head.isError, false);
      assert.equal(sourceOf(head.text), 'line one');
    });

    for (const range of [
      { start_line: 0 },
      { end_line: -1 },
      { start_line: 1.5 },
      { start_line: 3, end_line: 2 },
    ]) {
      it(format('refuses %j before any request', range), async () => {
        const refused = await read(tool, { ...args, ...range }, first);
        assert.deepStrictEqual(refused.requests, []);
        assert.equal(
          refused.thrown !== undefined || refused.isError === true,
          true,
        );
      });
    }

    it('a range outside the source is refused after the one GET, naming its line count', async () => {
      const whole = await read(tool, args, first);
      const outside = await read(
        tool,
        { ...args, start_line: 3, end_line: 6 },
        first,
      );
      assert.deepStrictEqual(outside.requests, whole.requests);
      assert.equal(outside.isError, true);
      assert.ok(outside.text.includes('the source has 5 lines'));
    });
  });
}

it('GetClass: the ranged read is the source GET, literally', async () => {
  const ranged = await read('GetClass', {
    class_name: 'ZCL_PIN',
    start_line: 2,
    end_line: 3,
  });
  assert.deepStrictEqual(ranged.requests, [
    {
      method: 'GET',
      url: '/sap/bc/adt/oo/classes/zcl_pin/source/main?version=active',
      headers: { Accept: 'text/plain' },
      body: undefined,
    },
  ]);
});

it('a source ending in a line break has as many lines as it has line breaks', async () => {
  const c: PinCase = {
    tool: 'GetClass',
    variant: 'onprem',
    stand: 'recording',
    args: { class_name: 'ZCL_PIN', start_line: 2, end_line: 3 },
    answers: [{ status: 200, data: 'one\ntwo\n' }],
    expected: 'none',
  };
  const recorded = await recordCase(c);
  assert.equal(recorded.answer?.isError, true);
  assert.ok(
    recorded.answer?.content[0]?.text.includes('the source has 2 lines'),
  );
});

/** SAP's answer to a class source read: CRLF line ends, none after the last line. */
const CRLF_SOURCE = corpusBody('read-class-source-text--01-read-source');

/** `GetClass` with `range`, SAP answering `source`; the answer's `source` and `line_count`. */
async function ranged(source: string, range: ToolArgs) {
  const recorded = await recordCase({
    tool: 'GetClass',
    variant: 'onprem',
    stand: 'recording',
    args: { class_name: 'ZCL_PIN', ...range },
    answers: [{ status: 200, data: source }],
    expected: 'none',
  });
  const text = recorded.answer?.content[0]?.text ?? '';
  return {
    isError: recorded.answer?.isError,
    text,
    source: sourceOf(text),
    line_count: member(payloadOf(text), 'line_count'),
  };
}

describe('CRLF source, as SAP sends it', () => {
  it('a middle range: its lines joined by CRLF, no line end after the last', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 1, end_line: 2 });
    assert.equal(cut.source, 'CLASS zbp_mcp_shr_i_root DEFINITION\r\n  PUBLIC');
    assert.equal(cut.line_count, 13);
  });

  it('one line in the middle is that line alone', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 12, end_line: 12 });
    assert.equal(cut.source, 'CLASS ZBP_MCP_SHR_I_ROOT IMPLEMENTATION.');
  });

  it('the last line, which SAP ends with no line end', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 12 });
    assert.equal(
      cut.source,
      'CLASS ZBP_MCP_SHR_I_ROOT IMPLEMENTATION.\r\nENDCLASS.',
    );
  });

  it('an empty line answers empty', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 4, end_line: 4 });
    assert.equal(cut.source, '');
  });

  it('a CRLF at the end closes the last line and opens none', async () => {
    const cut = await ranged(`${CRLF_SOURCE}\r\n`, { start_line: 13 });
    assert.equal(cut.source, 'ENDCLASS.');
    assert.equal(cut.line_count, 13);
    const outside = await ranged(`${CRLF_SOURCE}\r\n`, { start_line: 14 });
    assert.equal(outside.isError, true);
    assert.ok(outside.text.includes('the source has 13 lines'));
  });
});

it('a range with part "metadata" is refused before any request', async () => {
  const recorded = await recordCase({
    tool: 'GetClass',
    variant: 'onprem',
    stand: 'recording',
    args: { class_name: 'ZCL_PIN', part: 'metadata', start_line: 1 },
    expected: 'none',
  });
  assert.deepStrictEqual(recorded.requests, []);
  assert.equal(recorded.answer?.isError, true);
  assert.ok(recorded.answer?.content[0]?.text.includes('part "source"'));
});

it("a throw while the ranged answer is read is answered inside answer()'s boundary", async () => {
  const result = await answerSourceRead(
    { tool: 'GetClass', detail: 'terse' },
    { start: 1, end: 1 },
    async () => ({
      ok: true,
      getResult: () => {
        throw new Error('the reading broke');
      },
    }),
    (source) => source,
  );
  assert.equal(result.isError, true);
  assertMatchObject(JSON.parse(result.content[0]?.text ?? '{}'), {
    error: 'adapter_threw',
    tool: 'GetClass',
    message: 'the reading broke',
  });
});
