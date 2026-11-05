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

import { corpusBody } from '../../../lib/adtCorpus';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { answerSourceRead } from '../../../lib/handlers/sourceRange';
import { type PinCase, recordCase } from '../../helpers/pinCases';

/** A source of five lines, as SAP answers it. */
const SOURCE = [
  'line one',
  'line two',
  'line three',
  'line four',
  'line five',
].join('\n');

/** Every source read with a `source` part, and the arguments naming its object. */
const READERS: ReadonlyArray<{ tool: string; args: ToolArgs }> = [
  { tool: 'GetClass', args: { class_name: 'ZCL_PIN' } },
  { tool: 'GetInterface', args: { interface_name: 'ZIF_PIN' } },
  { tool: 'GetProgram', args: { program_name: 'ZPIN_PROG' } },
  { tool: 'GetInclude', args: { include_name: 'ZPIN_INCL' } },
  {
    tool: 'GetFunctionModule',
    args: { function_module_name: 'Z_PIN_FM', function_group_name: 'ZPIN_FG' },
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

/** A recording of `tool` with `args`, SAP answering `SOURCE` to every request. */
async function read(tool: string, args: ToolArgs) {
  const c: PinCase = {
    tool,
    variant: 'onprem',
    stand: 'recording',
    args,
    answers: [{ status: 200, data: SOURCE }],
    expected: 'none',
  };
  const recorded = await recordCase(c);
  const first = recorded.answer?.content[0];
  return {
    requests: recorded.requests,
    thrown: recorded.thrown,
    isError: recorded.answer?.isError,
    text: first === undefined ? '' : first.text,
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

describe.each(READERS)('$tool: a line range', ({ tool, args }) => {
  it('sends the whole read’s one GET and answers exactly the lines asked', async () => {
    const whole = await read(tool, args);
    expect(whole.isError).toBe(false);
    expect(whole.requests).toHaveLength(1);
    expect(sourceOf(whole.text)).toBe(SOURCE);

    const ranged = await read(tool, { ...args, start_line: 2, end_line: 4 });
    expect(ranged.isError).toBe(false);
    expect(ranged.requests).toEqual(whole.requests);
    expect(sourceOf(ranged.text)).toBe('line two\nline three\nline four');
    const payload = payloadOf(ranged.text);
    if (payload !== undefined) {
      expect({
        start_line: member(payload, 'start_line'),
        end_line: member(payload, 'end_line'),
        line_count: member(payload, 'line_count'),
      }).toEqual({ start_line: 2, end_line: 4, line_count: 5 });
    }
  });

  it('start_line alone reads to the end, end_line alone from the first line', async () => {
    const tail = await read(tool, { ...args, start_line: 4 });
    expect(tail.isError).toBe(false);
    expect(sourceOf(tail.text)).toBe('line four\nline five');
    const head = await read(tool, { ...args, end_line: 1 });
    expect(head.isError).toBe(false);
    expect(sourceOf(head.text)).toBe('line one');
  });

  it.each([
    { start_line: 0 },
    { end_line: -1 },
    { start_line: 1.5 },
    { start_line: 3, end_line: 2 },
  ])('refuses %j before any request', async (range) => {
    const refused = await read(tool, { ...args, ...range });
    expect(refused.requests).toEqual([]);
    expect(refused.thrown !== undefined || refused.isError === true).toBe(true);
  });

  it('a range outside the source is refused after the one GET, naming its line count', async () => {
    const whole = await read(tool, args);
    const outside = await read(tool, { ...args, start_line: 3, end_line: 6 });
    expect(outside.requests).toEqual(whole.requests);
    expect(outside.isError).toBe(true);
    expect(outside.text).toContain('the source has 5 lines');
  });
});

it('GetClass: the ranged read is the source GET, literally', async () => {
  const ranged = await read('GetClass', {
    class_name: 'ZCL_PIN',
    start_line: 2,
    end_line: 3,
  });
  expect(ranged.requests).toEqual([
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
  expect(recorded.answer?.isError).toBe(true);
  expect(recorded.answer?.content[0]?.text).toContain('the source has 2 lines');
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
    expect(cut.source).toBe('CLASS zbp_mcp_shr_i_root DEFINITION\r\n  PUBLIC');
    expect(cut.line_count).toBe(13);
  });

  it('one line in the middle is that line alone', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 12, end_line: 12 });
    expect(cut.source).toBe('CLASS ZBP_MCP_SHR_I_ROOT IMPLEMENTATION.');
  });

  it('the last line, which SAP ends with no line end', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 12 });
    expect(cut.source).toBe(
      'CLASS ZBP_MCP_SHR_I_ROOT IMPLEMENTATION.\r\nENDCLASS.',
    );
  });

  it('an empty line answers empty', async () => {
    const cut = await ranged(CRLF_SOURCE, { start_line: 4, end_line: 4 });
    expect(cut.source).toBe('');
  });

  it('a CRLF at the end closes the last line and opens none', async () => {
    const cut = await ranged(`${CRLF_SOURCE}\r\n`, { start_line: 13 });
    expect(cut.source).toBe('ENDCLASS.');
    expect(cut.line_count).toBe(13);
    const outside = await ranged(`${CRLF_SOURCE}\r\n`, { start_line: 14 });
    expect(outside.isError).toBe(true);
    expect(outside.text).toContain('the source has 13 lines');
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
  expect(recorded.requests).toEqual([]);
  expect(recorded.answer?.isError).toBe(true);
  expect(recorded.answer?.content[0]?.text).toContain('part "source"');
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
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({
    error: 'adapter_threw',
    tool: 'GetClass',
    message: 'the reading broke',
  });
});
