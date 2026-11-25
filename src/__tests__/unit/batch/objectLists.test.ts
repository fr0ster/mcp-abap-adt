/**
 * The object lists on internal batches (spec §11, row `DescribeByList`):
 * each phase's independent reads
 * go in one envelope; the answer is the sequential version's; a part's
 * failure is its item's; a credential refusal ends the call as it came; a
 * destination with no communication batch runs the sequential reads.
 *
 * Real handlers, real clients, real `AdtBatchConnection`; only the
 * connection is a fake, answering from a small model — the same model for
 * an envelope's parts and for the sequential version's requests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  TOOL_DEFINITION as DESCRIBE_BY_LIST,
  handleDescribeByList as handleDescribeByListOf,
} from '../../../handlers/system/readonly/handleDescribeByList';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { assertMatchObject } from '../../helpers/assertions';
import {
  envelopeConnection,
  envelopeResponse,
  type InnerRequest,
  type PartAnswer,
  type SeenEnvelope,
  statusError,
} from '../../helpers/batchEnvelope';
import { schemaWords } from '../../helpers/schemaWords';
import { withinTurns } from '../../helpers/withinTurns';

/** handleDescribeByList at `detail: 'full'`, the answer before `detail` these cases compare (terse answers, step 3). */
const handleDescribeByList = (
  context: Parameters<typeof handleDescribeByListOf>[0],
  args: Parameters<typeof handleDescribeByListOf>[1],
) => handleDescribeByListOf(context, { detail: 'full', ...args });

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

// ---------------------------------------------------------------------------
// The model, by request label
// ---------------------------------------------------------------------------

/**
 * A request's label: `qs:<query>:<type>` (a quickSearch; no type: empty), `src:class|intf:<name>`.
 * A quickSearch's type is the search name the object's code stands for
 * (`CLAS/OC` → `CLAS`, `PROG/I` → `INCL`; `searchTypes.ts`).
 */
function labelOf(method: string, url: string, params?: unknown): string {
  const parsed = new URL(url, 'https://system.invalid');
  const query = new URLSearchParams(parsed.search);
  for (const [k, v] of Object.entries(
    (params ?? {}) as Record<string, unknown>,
  )) {
    if (v !== undefined) query.set(k, String(v));
  }
  const path = decodeURIComponent(parsed.pathname);
  if (path === '/sap/bc/adt/repository/informationsystem/search') {
    return `qs:${query.get('query')}:${query.get('objectType') ?? ''}`;
  }
  const groups = '/sap/bc/adt/functions/groups/';
  if (path.startsWith(groups)) {
    const [group = '', , name = ''] = path.slice(groups.length).split('/');
    return `src:func:${group.toUpperCase()}/${name.toUpperCase()}`;
  }
  const kinds: Array<[string, string]> = [
    ['/sap/bc/adt/oo/classes/', 'class'],
    ['/sap/bc/adt/oo/interfaces/', 'intf'],
  ];
  for (const [prefix, kind] of kinds) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).split('/')[0]?.toUpperCase() ?? '';
    return `src:${kind}:${name}`;
  }
  return `${method} ${path}`;
}

const xml = { 'content-type': 'application/xml' };
const text = { 'content-type': 'text/plain' };

const ok = (body: string, headers = xml): PartAnswer => ({
  status: 200,
  statusText: 'OK',
  headers,
  body,
});

const hitsXml = (
  hits: Array<{ name: string; type: string; description: string }>,
) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${hits
    .map(
      (h) =>
        `<adtcore:objectReference adtcore:uri="/sap/bc/adt/x/${h.name.toLowerCase()}" adtcore:type="${h.type}" adtcore:name="${h.name}" adtcore:packageName="ZPKG" adtcore:description="${h.description}"/>`,
    )
    .join('')}</adtcore:objectReferences>`;

const BAD_REQUEST: PartAnswer = {
  status: 400,
  statusText: 'Bad Request',
  body: '',
};
const FORBIDDEN: PartAnswer = {
  status: 403,
  statusText: 'Forbidden',
  body: '',
};
const FAILED: PartAnswer = {
  status: 500,
  statusText: 'Internal Server Error',
  body: '',
};
const UNAUTHORIZED: PartAnswer = {
  status: 401,
  statusText: 'Unauthorized',
  body: '',
};

/** The system: one answer per label; anything else is `404`. */
const REPOSITORY: Record<string, PartAnswer> = {
  // Searches: a typed hit; a type the search refuses, found without it; an
  // untyped name.
  'qs:ZCL_A:CLAS': ok(
    hitsXml([{ name: 'ZCL_A', type: 'CLAS/OC', description: 'Class A' }]),
  ),
  'qs:ZPROG_B:INCL': BAD_REQUEST,
  'qs:ZPROG_B:': ok(
    hitsXml([{ name: 'ZPROG_B', type: 'PROG/P', description: 'Program B' }]),
  ),
  'qs:ZT*:': ok(
    hitsXml([
      { name: 'ZT1', type: 'TABL/DT', description: 'Table 1' },
      { name: 'ZT2', type: 'TABL/DT', description: 'Table 2' },
    ]),
  ),
  'qs:ZNONE:': ok(hitsXml([])),

  // A function module's search: its address names its group (measured on
  // premise and on ABAP cloud: `…/functions/groups/{group}/fmodules/{name}`).
  'qs:Z_FUNC:FUNC': ok(
    '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zfg_a/fmodules/z_func" adtcore:type="FUGR/FF" adtcore:name="Z_FUNC" adtcore:packageName="ZPKG" adtcore:description="Function Z"/></adtcore:objectReferences>',
  ),

  // Sources of the symbols.
  'src:func:ZFG_A/Z_FUNC': ok('FUNCTION z_func.\nENDFUNCTION.', text),
  'src:class:ZCL_A': ok('CLASS zcl_a DEFINITION PUBLIC.\nENDCLASS.', text),
  'src:class:ZCL_B': ok('CLASS zcl_b DEFINITION PUBLIC.\nENDCLASS.', text),
  'src:intf:ZIF_A': ok('INTERFACE zif_a PUBLIC.\nENDINTERFACE.', text),
};

interface Model {
  /** Answers replacing the repository's, by label. */
  answers?: Record<string, PartAnswer>;
}

function answerOf(model: Model, label: string): PartAnswer {
  return (
    model.answers?.[label] ??
    REPOSITORY[label] ?? { status: 404, statusText: 'Not Found', body: '' }
  );
}

/**
 * The system: envelopes answered part by part, direct requests one by one,
 * from the same model; `envelope` replaces the envelope's answer (an
 * envelope numbered from 1).
 */
function system(
  model: Model = {},
  envelope?: (parts: InnerRequest[], index: number) => IAdtWireResponse,
) {
  let sent = 0;
  return envelopeConnection(
    (parts) => {
      sent += 1;
      if (envelope !== undefined) return envelope(parts, sent);
      return envelopeResponse(
        parts.map((p) => answerOf(model, labelOf(p.method, p.url))),
      );
    },
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      const a = answerOf(
        model,
        labelOf(request.method, request.url, request.params),
      );
      if (a.status >= 400) {
        throw statusError(a.status, a.statusText ?? '', a.body ?? '');
      }
      return {
        status: a.status,
        statusText: a.statusText ?? 'OK',
        headers: a.headers ?? {},
        data: a.body ?? '',
      } as IAdtWireResponse;
    },
  );
}

type Fake = ReturnType<typeof system>;

/** A context on the fake: batch served (default) or known to be absent. */
function contextOn(fake: Fake, batch: 'served' | 'absent' = 'served') {
  const port = createBatchAvailability();
  if (batch === 'absent') port.noteOuterStatus(404);
  return {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: port,
  } as unknown as HandlerContext;
}

/** An answer's content, whole: text or json. */
const contentOf = (result: unknown): string =>
  JSON.stringify((result as { content?: unknown }).content ?? null);
const textOf = (result: unknown): string =>
  String(
    (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '',
  );
const payloadOf = (result: unknown) => JSON.parse(textOf(result));

/** Every envelope's parts, by label, in the order sent. */
const phasesOf = (fake: Fake) =>
  fake.envelopes.map((e: SeenEnvelope) =>
    e.parts.map((p) => labelOf(p.method, p.url)),
  );

/** The sequential version's requests, by label, in the order sent. */
const directsOf = (fake: Fake) =>
  fake.directs.map((r) => labelOf(r.method, r.url, r.params));

const TURNS = 5000;

type Handler = (context: HandlerContext, args: any) => Promise<unknown>;

/** The batched answer and the sequential one, of the same call on the same model. */
async function bothWays(
  handler: Handler,
  args: Record<string, unknown>,
  model: Model = {},
) {
  const batched = system(model);
  const sequential = system(model);
  const a = await withinTurns(handler(contextOn(batched), args), TURNS);
  const b = await withinTurns(
    handler(contextOn(sequential, 'absent'), args),
    TURNS,
  );
  return { a, b, batched, sequential };
}

/**
 * The envelope's own request. Every part of an envelope that failed as a
 * whole rejects with the envelope's one error, whose `request` is the
 * envelope's POST (adt-clients 34.2.1): each such failure names it.
 */
const ENVELOPE_REQUEST = {
  method: 'POST',
  url: '/sap/bc/adt/communication/batch',
};

type Replacer = (key: string, value: unknown) => unknown;

/** An answer's content, whole: each text parsed when it is JSON. */
const wholeOf = (result: unknown, replacer?: Replacer): unknown[] => {
  const content = (result as { content?: Array<Record<string, unknown>> })
    .content;
  return (content ?? []).map((item) => {
    if (typeof item.text === 'string') {
      try {
        return JSON.parse(JSON.stringify(JSON.parse(item.text), replacer));
      } catch {
        return item.text;
      }
    }
    return JSON.parse(JSON.stringify(item, replacer));
  });
};

/** Every `request` an answer's failures name, in order. */
const requestsOf = (result: unknown): unknown[] => {
  const requests: unknown[] = [];
  wholeOf(result, (key, value) => {
    if (key === 'request') requests.push(value);
    return value;
  });
  return requests;
};

/**
 * The answer of a call whose envelope failed as a whole: the sequential
 * answer, whole, except that each of the `failures` that went into the
 * failed envelope names the envelope's own request where the sequential one
 * names its read's. Every other failure names the same request as the
 * sequential one.
 */
function expectEnvelopeFailure(
  result: unknown,
  sequential: unknown,
  failures: number,
) {
  const isEnvelope = (request: unknown) =>
    JSON.stringify(request) === JSON.stringify(ENVELOPE_REQUEST);
  const own = requestsOf(sequential);
  const named = requestsOf(result);
  assert.equal(own.filter(isEnvelope).length, 0);
  assert.equal(named.length, own.length);
  assert.equal(named.filter(isEnvelope).length, failures);
  let at = 0;
  assert.deepStrictEqual(
    wholeOf(result),
    wholeOf(sequential, (key, value) => {
      if (key !== 'request') return value;
      return isEnvelope(named[at++]) ? ENVELOPE_REQUEST : value;
    }),
  );
}

/**
 * The sequential answer to the reads of a failed envelope: each of those
 * reads answered `500` on its own.
 */
async function sequentialWithFailed(
  handler: Handler,
  args: Record<string, unknown>,
  labels: string[],
) {
  const fake = system({
    answers: Object.fromEntries(labels.map((label) => [label, FAILED])),
  });
  return withinTurns(handler(contextOn(fake, 'absent'), args), TURNS);
}

/** A system whose envelope number `failing` fails as a whole (`500`). */
function failingEnvelope(failing: number) {
  return system({}, (parts, index) => {
    if (index === failing) throw statusError(500, 'Internal Server Error');
    return envelopeResponse(
      parts.map((p) => answerOf({}, labelOf(p.method, p.url))),
    );
  });
}

/** The connection's refusal of the credential, before SAP was asked. */
const credential = () =>
  new AuthRefusedError(
    authError['credential-refused']({ credential: 'token' }),
    'request',
  );

/** An outer `404` to the first envelope, and the sequential reference answer. */
async function noCommunicationBatch(handler: Handler, args: object) {
  const fake = system({}, () => {
    throw statusError(404, 'Not Found');
  });
  const context = contextOn(fake);
  const result = await withinTurns(handler(context, args), TURNS);
  const reference = system();
  const expected = await withinTurns(
    handler(contextOn(reference, 'absent'), args),
    TURNS,
  );
  return { fake, context, result, expected, reference };
}

// ---------------------------------------------------------------------------
// DescribeByList
// ---------------------------------------------------------------------------

const OBJECTS = [
  { name: 'ZCL_A', type: 'CLAS/OC' },
  { name: 'ZPROG_B', type: 'PROG/I' },
  { name: 'ZT*' },
  { name: 'ZNONE' },
];

describe('DescribeByList', () => {
  for (const [args] of [
    [{ objects: OBJECTS }],
    [{ objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }] }],
    [{ objects: [{ name: 'ZMISSING', type: 'CLAS/OC' }, { name: 'ZT*' }] }],
  ]) {
    it(format('same answer as the sequential version: %j', args), async () => {
      const { a, b, batched, sequential } = await bothWays(
        handleDescribeByList,
        args,
      );
      assert.equal(contentOf(a), contentOf(b));
      assert.equal(batched.directs.length, 0);
      assert.ok(batched.envelopes.length > 0);
      assert.equal(sequential.envelopes.length, 0);
    });
  }

  it('phases: every quickSearch, then the typeless ones for the answers that failed or were empty', async () => {
    const fake = system();
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake), [
      ['qs:ZCL_A:CLAS', 'qs:ZPROG_B:INCL', 'qs:ZT*:', 'qs:ZNONE:'],
      ['qs:ZPROG_B:'],
    ]);
    const names = (result as { content: Array<{ text: string }> }).content.map(
      (c) => JSON.parse(c.text).name,
    );
    assert.deepStrictEqual(names, ['ZCL_A', 'ZPROG_B', 'ZT*', 'ZNONE']);
  });

  it('nothing to search again: one envelope', async () => {
    const fake = system();
    await withinTurns(
      handleDescribeByList(contextOn(fake), {
        objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }, { name: 'ZT*' }],
      }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake), [['qs:ZCL_A:CLAS', 'qs:ZT*:']]);
  });

  it("a part's failure is that object's: the typeless search refused too is its error entry", async () => {
    const model = { answers: { 'qs:ZPROG_B:': FORBIDDEN } };
    const { a, b } = await bothWays(
      handleDescribeByList,
      { objects: OBJECTS },
      model,
    );
    assert.equal(contentOf(a), contentOf(b));
    const entries = (a as { content: Array<{ text: string }> }).content.map(
      (c) => JSON.parse(c.text),
    );
    assertMatchObject(entries[1], {
      name: 'ZPROG_B',
      error: { status: 403, step: 'search' },
    });
    assert.deepStrictEqual(
      entries.map((e) => e.name),
      ['ZCL_A', 'ZPROG_B', 'ZT*', 'ZNONE'],
    );
  });

  it('a 401 SAP answered to a first search ends the call as it came; no second phase', async () => {
    const model = { answers: { 'qs:ZT*:': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleDescribeByList,
      { objects: OBJECTS },
      model,
    );
    assert.equal(contentOf(a), contentOf(b));
    assertMatchObject(payloadOf(a), { status: 401 });
    assert.equal(batched.envelopes.length, 1);
  });

  it('a 401 SAP answered to a typeless search ends the call as it came', async () => {
    const model = { answers: { 'qs:ZPROG_B:': UNAUTHORIZED } };
    const { a, b } = await bothWays(
      handleDescribeByList,
      { objects: OBJECTS },
      model,
    );
    assert.equal(contentOf(a), contentOf(b));
    assertMatchObject(payloadOf(a), { status: 401 });
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    assert.equal(payloadOf(result).error, 'authentication_failed');
    assert.equal(fake.envelopes.length, 1);
  });

  it("an envelope that fails is every search's failure, as the sequential version answers each", async () => {
    const fake = failingEnvelope(2);
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    const expected = await sequentialWithFailed(
      handleDescribeByList,
      { objects: OBJECTS },
      phasesOf(fake)[1] as string[],
    );
    expectEnvelopeFailure(result, expected, 1);
    assert.equal(fake.envelopes.length, 2);
    assert.equal(fake.directs.length, 0);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const { fake, context, result, expected } = await noCommunicationBatch(
      handleDescribeByList,
      { objects: OBJECTS },
    );
    assert.equal(contentOf(result), contentOf(expected));
    assert.equal(fake.envelopes.length, 1);
    assert.ok(fake.directs.length > 0);
    assert.equal(context.batchAvailability?.available(), false);
  });

  it('a typed search answered 406 is that object’s error; no typeless search', async () => {
    const fake = system({
      answers: {
        'qs:ZPROG_B:INCL': { status: 406, statusText: 'Not Acceptable' },
      },
    });
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake), [
      ['qs:ZCL_A:CLAS', 'qs:ZPROG_B:INCL', 'qs:ZT*:', 'qs:ZNONE:'],
    ]);
    const entries = (
      result as { content: Array<{ text: string }> }
    ).content.map((c) => JSON.parse(c.text));
    assertMatchObject(entries[1], {
      name: 'ZPROG_B',
      error: { status: 406, step: 'search' },
    });
    assert.deepStrictEqual(
      entries.map((e) => e.name),
      ['ZCL_A', 'ZPROG_B', 'ZT*', 'ZNONE'],
    );
  });

  it('no objects: the parameter error, by the schema', () => {
    assert.ok(
      schemaWords(DESCRIBE_BY_LIST, { objects: [] }).includes(
        'objects (array) is required',
      ),
    );
  });
});
