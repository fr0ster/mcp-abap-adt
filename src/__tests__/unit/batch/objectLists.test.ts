/**
 * The object lists on internal batches (spec §11, rows `ListTransports`,
 * `DescribeByList`, `GetAbapSystemSymbols`): each phase's independent reads
 * go in one envelope; the answer is the sequential version's; a part's
 * failure is its item's; a credential refusal ends the call as it came; a
 * destination with no communication batch runs the sequential reads.
 *
 * Real handlers, real clients, real `AdtBatchConnection`; only the
 * connection is a fake, answering from a small model — the same model for
 * an envelope's parts and for the sequential version's requests.
 */
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { handleDescribeByList } from '../../../handlers/system/readonly/handleDescribeByList';
import { handleGetAbapSystemSymbols } from '../../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { handleListTransports } from '../../../handlers/transport/readonly/handleListTransports';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { switchAcceptCorrectionOn } from '../../../lib/connectionFactory';
import {
  envelopeConnection,
  envelopeResponse,
  type InnerRequest,
  type PartAnswer,
  type SeenEnvelope,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

// ---------------------------------------------------------------------------
// The model, by request label
// ---------------------------------------------------------------------------

const CONFIGURATIONS_PATH =
  '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations';

/**
 * A request's label: `configs` (the search configurations), `list:<config>`
 * (a transport search by its configuration's last segment),
 * `qs:<query>:<type>` (a quickSearch; no type: empty), `src:class|intf:<name>`.
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
  if (path === CONFIGURATIONS_PATH) return 'configs';
  if (path === '/sap/bc/adt/cts/transportrequests') {
    return `list:${(query.get('configUri') ?? '').split('/').pop()}`;
  }
  if (path === '/sap/bc/adt/repository/informationsystem/search') {
    return `qs:${query.get('query')}:${query.get('objectType') ?? ''}`;
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

const configurationsXml = (ids: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><configurations:configurations xmlns:configurations="http://www.sap.com/adt/configurations">${ids
    .map(
      (id) =>
        `<configuration:configuration client="000" xmlns:configuration="http://www.sap.com/adt/configuration"><atom:link href="${CONFIGURATIONS_PATH}/${id}" rel="http://www.sap.com/adt/categories/configurations" type="application/vnd.sap.adt.configuration.v1+xml" etag="1" xmlns:atom="http://www.w3.org/2005/Atom"/></configuration:configuration>`,
    )
    .join('')}</configurations:configurations>`;

const transportsXml = (
  requests: Array<{ number: string; owner: string; status: string }>,
) =>
  `<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:workbench tm:category="Workbench"><tm:modifiable>${requests
    .map(
      (r) =>
        `<tm:request tm:number="${r.number}" tm:owner="${r.owner}" tm:desc="request ${r.number}" tm:type="K" tm:status="${r.status}"/>`,
    )
    .join('')}</tm:modifiable></tm:workbench></tm:root>`;

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
  configs: ok(configurationsXml(['CFG1', 'CFG2'])),
  'list:CFG1': ok(
    transportsXml([
      { number: 'ZREQ000001', owner: 'OWNER_A', status: 'D' },
      { number: 'ZREQ000002', owner: 'OWNER_B', status: 'R' },
    ]),
  ),
  'list:CFG2': ok(
    transportsXml([
      { number: 'ZREQ000003', owner: 'OWNER_A', status: 'D' },
      { number: 'ZREQ000001', owner: 'OWNER_A', status: 'D' },
    ]),
  ),
  'list:CFG3': ok(transportsXml([])),
  'list:CFG4': ok(transportsXml([])),
  'list:CFG5': ok(transportsXml([])),
  'list:CFG6': ok(transportsXml([])),

  // Searches: a typed hit; a type the search refuses, found without it; an
  // untyped name.
  'qs:ZCL_A:CLAS/OC': ok(
    hitsXml([{ name: 'ZCL_A', type: 'CLAS/OC', description: 'Class A' }]),
  ),
  'qs:ZPROG_B:WRONG': BAD_REQUEST,
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

  // Sources of the symbols.
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
  expect(own.filter(isEnvelope)).toHaveLength(0);
  expect(named).toHaveLength(own.length);
  expect(named.filter(isEnvelope)).toHaveLength(failures);
  let at = 0;
  expect(wholeOf(result)).toEqual(
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
// ListTransports
// ---------------------------------------------------------------------------

const SIX = ok(
  configurationsXml(['CFG1', 'CFG2', 'CFG3', 'CFG4', 'CFG5', 'CFG6']),
);

describe('ListTransports', () => {
  it.each<[Record<string, unknown>, Model]>([
    [{ user: 'owner_a' }, {}],
    [{ user: 'OWNER_B', modifiable_only: false }, {}],
    [{ modifiable_only: false, detail: 'full' }, {}],
    [{ user: 'owner_a', detail: 'raw' }, {}],
    [
      { user: 'owner_a' },
      { answers: { configs: ok(configurationsXml(['CFG1'])) } },
    ],
    [{ user: 'owner_a' }, { answers: { configs: SIX } }],
  ])('same answer as the sequential version: %j', async (args, model) => {
    const { a, b, batched, sequential } = await bothWays(
      handleListTransports,
      args,
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect((a as { isError?: boolean }).isError).toBe(false);
    expect(batched.directs).toHaveLength(0);
    expect(batched.envelopes.length).toBeGreaterThan(0);
    expect(sequential.envelopes).toHaveLength(0);
  });

  it('phases: the configurations, then every configuration’s search in one envelope', async () => {
    const fake = system();
    const result = await withinTurns(
      handleListTransports(contextOn(fake), { user: 'owner_a' }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([['configs'], ['list:CFG1', 'list:CFG2']]);
    expect(payloadOf(result)).toMatchObject({
      count: 2,
      searched_configurations: [
        `${CONFIGURATIONS_PATH}/CFG1`,
        `${CONFIGURATIONS_PATH}/CFG2`,
      ],
    });
  });

  it('up to five configurations are searched, in the one envelope', async () => {
    const fake = system({ answers: { configs: SIX } });
    const result = await withinTurns(
      handleListTransports(contextOn(fake), {}),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['configs'],
      ['list:CFG1', 'list:CFG2', 'list:CFG3', 'list:CFG4', 'list:CFG5'],
    ]);
    expect(payloadOf(result).configurations_capped).toBe(5);
  });

  it.each<[string, Model, number]>([
    [
      'no configuration',
      { answers: { configs: ok(configurationsXml([])) } },
      1,
    ],
    ['the configurations refused', { answers: { configs: FORBIDDEN } }, 1],
    ['a search refused', { answers: { 'list:CFG1': FORBIDDEN } }, 2],
    ['the second search refused', { answers: { 'list:CFG2': FORBIDDEN } }, 2],
  ])(
    '%s: the sequential answer; no envelope after the one that answered it',
    async (_case, model, envelopes) => {
      const { a, b, batched } = await bothWays(handleListTransports, {}, model);
      expect(textOf(a)).toBe(textOf(b));
      expect((a as { isError?: boolean }).isError).toBe(true);
      expect(batched.envelopes).toHaveLength(envelopes);
    },
  );

  it('a search refused: both searches were sent together, where the sequential version stops at the first', async () => {
    const { batched, sequential } = await bothWays(
      handleListTransports,
      {},
      { answers: { 'list:CFG1': FORBIDDEN } },
    );
    expect(phasesOf(batched)[1]).toEqual(['list:CFG1', 'list:CFG2']);
    expect(directsOf(sequential)).toEqual(['configs', 'list:CFG1']);
  });

  it('a 401 SAP answered to a search ends the call as it came', async () => {
    const { a, b } = await bothWays(
      handleListTransports,
      {},
      { answers: { 'list:CFG2': UNAUTHORIZED } },
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401, step: 'list' });
  });

  it('a 401 SAP answered to the configurations ends the call; no search is sent', async () => {
    const { a, b, batched } = await bothWays(
      handleListTransports,
      {},
      { answers: { configs: UNAUTHORIZED } },
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
    expect(batched.envelopes).toHaveLength(1);
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    for (const failing of [1, 2]) {
      const fake = system({}, (parts, index) => {
        if (index === failing) throw credential();
        return envelopeResponse(
          parts.map((p) => answerOf({}, labelOf(p.method, p.url))),
        );
      });
      const result = await withinTurns(
        handleListTransports(contextOn(fake), {}),
        TURNS,
      );
      expect(payloadOf(result).error).toBe('authentication_failed');
      expect(fake.envelopes).toHaveLength(failing);
    }
  });

  it("an envelope that fails is every search's failure; the answer is the sequential one's first failure", async () => {
    const fake = failingEnvelope(2);
    const result = await withinTurns(
      handleListTransports(contextOn(fake), {}),
      TURNS,
    );
    const expected = await sequentialWithFailed(
      handleListTransports,
      {},
      phasesOf(fake)[1] as string[],
    );
    expectEnvelopeFailure(result, expected, 1);
    expect(payloadOf(result)).toMatchObject({ status: 500, step: 'list' });
    expect(fake.envelopes).toHaveLength(2);
    expect(fake.directs).toHaveLength(0);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const { fake, context, result, expected } = await noCommunicationBatch(
      handleListTransports,
      { user: 'owner_a' },
    );
    expect(textOf(result)).toBe(textOf(expected));
    expect(fake.envelopes).toHaveLength(1);
    expect(directsOf(fake)).toEqual(['configs', 'list:CFG1', 'list:CFG2']);
    expect(context.batchAvailability?.available()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DescribeByList
// ---------------------------------------------------------------------------

const OBJECTS = [
  { name: 'ZCL_A', type: 'CLAS/OC' },
  { name: 'ZPROG_B', type: 'WRONG' },
  { name: 'ZT*' },
  { name: 'ZNONE' },
];

describe('DescribeByList', () => {
  it.each([
    [{ objects: OBJECTS }],
    [{ objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }] }],
    [{ objects: [{ name: 'ZMISSING', type: 'CLAS/OC' }, { name: 'ZT*' }] }],
  ])('same answer as the sequential version: %j', async (args) => {
    const { a, b, batched, sequential } = await bothWays(
      handleDescribeByList,
      args,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    expect(batched.directs).toHaveLength(0);
    expect(batched.envelopes.length).toBeGreaterThan(0);
    expect(sequential.envelopes).toHaveLength(0);
  });

  it('phases: every quickSearch, then the typeless ones for the answers that failed or were empty', async () => {
    const fake = system();
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['qs:ZCL_A:CLAS/OC', 'qs:ZPROG_B:WRONG', 'qs:ZT*:', 'qs:ZNONE:'],
      ['qs:ZPROG_B:'],
    ]);
    const names = (result as { content: Array<{ text: string }> }).content.map(
      (c) => JSON.parse(c.text).name,
    );
    expect(names).toEqual(['ZCL_A', 'ZPROG_B', 'ZT*', 'ZNONE']);
  });

  it('nothing to search again: one envelope', async () => {
    const fake = system();
    await withinTurns(
      handleDescribeByList(contextOn(fake), {
        objects: [{ name: 'ZCL_A', type: 'CLAS/OC' }, { name: 'ZT*' }],
      }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([['qs:ZCL_A:CLAS/OC', 'qs:ZT*:']]);
  });

  it("a part's failure is that object's: the typeless search refused too is its error entry", async () => {
    const model = { answers: { 'qs:ZPROG_B:': FORBIDDEN } };
    const { a, b } = await bothWays(
      handleDescribeByList,
      { objects: OBJECTS },
      model,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    const entries = (a as { content: Array<{ text: string }> }).content.map(
      (c) => JSON.parse(c.text),
    );
    expect(entries[1]).toMatchObject({
      name: 'ZPROG_B',
      error: { status: 403, step: 'search' },
    });
    expect(entries.map((e) => e.name)).toEqual([
      'ZCL_A',
      'ZPROG_B',
      'ZT*',
      'ZNONE',
    ]);
  });

  it('a 401 SAP answered to a first search ends the call as it came; no second phase', async () => {
    const model = { answers: { 'qs:ZT*:': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleDescribeByList,
      { objects: OBJECTS },
      model,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
    expect(batched.envelopes).toHaveLength(1);
  });

  it('a 401 SAP answered to a typeless search ends the call as it came', async () => {
    const model = { answers: { 'qs:ZPROG_B:': UNAUTHORIZED } };
    const { a, b } = await bothWays(
      handleDescribeByList,
      { objects: OBJECTS },
      model,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(1);
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
    expect(fake.envelopes).toHaveLength(2);
    expect(fake.directs).toHaveLength(0);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const { fake, context, result, expected } = await noCommunicationBatch(
      handleDescribeByList,
      { objects: OBJECTS },
    );
    expect(contentOf(result)).toBe(contentOf(expected));
    expect(fake.envelopes).toHaveLength(1);
    expect(fake.directs.length).toBeGreaterThan(0);
    expect(context.batchAvailability?.available()).toBe(false);
  });

  it('a typed search answered 406 naming no type is that object’s error; no typeless search', async () => {
    const fake = system({
      answers: {
        'qs:ZPROG_B:WRONG': { status: 406, statusText: 'Not Acceptable' },
      },
    });
    const result = await withinTurns(
      handleDescribeByList(contextOn(fake), { objects: OBJECTS }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['qs:ZCL_A:CLAS/OC', 'qs:ZPROG_B:WRONG', 'qs:ZT*:', 'qs:ZNONE:'],
    ]);
    const entries = (
      result as { content: Array<{ text: string }> }
    ).content.map((c) => JSON.parse(c.text));
    expect(entries[1]).toMatchObject({
      name: 'ZPROG_B',
      error: { status: 406, step: 'search' },
    });
    expect(entries.map((e) => e.name)).toEqual([
      'ZCL_A',
      'ZPROG_B',
      'ZT*',
      'ZNONE',
    ]);
  });

  it('a typed search answered 406 naming a type is corrected in its own envelope: the sequential answer', async () => {
    const OBJREFS = 'application/vnd.sap.adt.repository.objrefs+xml';
    const typedHit = ok(
      hitsXml([{ name: 'ZPROG_B', type: 'PROG/P', description: 'Program B' }]),
    );
    // SAP serves the typed search of ZPROG_B only as OBJREFS.
    const answer = (label: string, accept: string | undefined): PartAnswer =>
      label === 'qs:ZPROG_B:WRONG'
        ? accept === OBJREFS
          ? typedHit
          : {
              status: 406,
              statusText: 'Not Acceptable',
              headers: { 'x-sap-adt-supported-accept': OBJREFS },
            }
        : answerOf({}, label);
    const fakeOf = () =>
      envelopeConnection(
        (parts) =>
          envelopeResponse(
            parts.map((p) =>
              answer(labelOf(p.method, p.url), p.headers.accept),
            ),
          ),
        async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
          const accept = Object.entries(request.headers ?? {}).find(
            ([k]) => k.toLowerCase() === 'accept',
          )?.[1];
          const a = answer(
            labelOf(request.method, request.url, request.params),
            accept === undefined ? undefined : String(accept),
          );
          if (a.status >= 400) {
            throw statusError(
              a.status,
              a.statusText ?? '',
              a.body ?? '',
              a.headers ?? {},
            );
          }
          return {
            status: a.status,
            statusText: a.statusText ?? 'OK',
            headers: a.headers ?? {},
            data: a.body ?? '',
          } as IAdtWireResponse;
        },
      );
    const batched = fakeOf();
    switchAcceptCorrectionOn(batched.connection as never);
    const a = await withinTurns(
      handleDescribeByList(contextOn(batched), { objects: OBJECTS }),
      TURNS,
    );
    const sequential = fakeOf();
    switchAcceptCorrectionOn(sequential.connection as never);
    const b = await withinTurns(
      handleDescribeByList(contextOn(sequential, 'absent'), {
        objects: OBJECTS,
      }),
      TURNS,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    expect(
      batched.envelopes.map((e) =>
        e.parts.map((p) => [labelOf(p.method, p.url), p.headers.accept]),
      ),
    ).toEqual([
      [
        ['qs:ZCL_A:CLAS/OC', 'application/xml'],
        ['qs:ZPROG_B:WRONG', 'application/xml'],
        ['qs:ZT*:', 'application/xml'],
        ['qs:ZNONE:', 'application/xml'],
      ],
      [['qs:ZPROG_B:WRONG', OBJREFS]],
    ]);
    expect(batched.directs).toHaveLength(0);
  });

  it('no objects: the parameter error, nothing sent', async () => {
    const fake = system();
    await expect(
      handleDescribeByList(contextOn(fake), { objects: [] }),
    ).rejects.toThrow('objects (array) is required');
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GetAbapSystemSymbols
// ---------------------------------------------------------------------------

const CODE = [
  'CLASS zcl_a DEFINITION PUBLIC.',
  '  PUBLIC SECTION.',
  '    METHODS run IMPORTING iv TYPE i.',
  'ENDCLASS.',
  'INTERFACE zif_a PUBLIC.',
  'ENDINTERFACE.',
  'CLASS zcl_b DEFINITION.',
  'ENDCLASS.',
  'CLASS zcl_gone DEFINITION.',
  'ENDCLASS.',
  'FUNCTION z_func.',
  'ENDFUNCTION.',
  'DATA lv_count TYPE i.',
].join('\n');

describe('GetAbapSystemSymbols', () => {
  it.each([[{ code: CODE }], [{ code: 'DATA lv TYPE i.' }]])(
    'same answer as the sequential version: %j',
    async (args) => {
      const { a, b, batched, sequential } = await bothWays(
        handleGetAbapSystemSymbols,
        args,
      );
      expect(contentOf(a)).toBe(contentOf(b));
      expect(batched.directs).toHaveLength(0);
      expect(sequential.envelopes).toHaveLength(0);
    },
  );

  it('one phase: every symbol’s read, each independent of the others, in one envelope', async () => {
    const fake = system();
    await withinTurns(
      handleGetAbapSystemSymbols(contextOn(fake), { code: CODE }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      [
        'src:class:ZCL_A',
        'src:intf:ZIF_A',
        'src:class:ZCL_B',
        'src:class:ZCL_GONE',
      ],
    ]);
    expect(fake.directs).toHaveLength(0);
  });

  it('nothing to read in the system: no envelope', async () => {
    const fake = system();
    await withinTurns(
      handleGetAbapSystemSymbols(contextOn(fake), { code: 'DATA lv TYPE i.' }),
      TURNS,
    );
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(0);
  });

  it("a part's failure is that symbol's; the rest resolve", async () => {
    const model = { answers: { 'src:class:ZCL_B': FORBIDDEN } };
    const { a, b } = await bothWays(
      handleGetAbapSystemSymbols,
      { code: CODE },
      model,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    const symbols = (a as any).content[0].json.symbols;
    const named = (name: string) =>
      symbols.find((s: { name: string }) => s.name === name);
    expect(named('ZCL_B').error).toMatchObject({
      status: 403,
      step: 'read class',
    });
    expect(named('ZCL_A').systemInfo.exists).toBe(true);
    expect(named('ZCL_GONE').error).toMatchObject({ status: 404 });
  });

  it('a 401 SAP answered to a symbol ends the call as it came', async () => {
    const model = { answers: { 'src:intf:ZIF_A': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleGetAbapSystemSymbols,
      { code: CODE },
      model,
    );
    expect(contentOf(a)).toBe(contentOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
    expect(batched.envelopes).toHaveLength(1);
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetAbapSystemSymbols(contextOn(fake), { code: CODE }),
      TURNS,
    );
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(1);
  });

  it('a failed envelope: every read symbol answers the error; nothing is retried', async () => {
    const fake = failingEnvelope(1);
    const result = await withinTurns(
      handleGetAbapSystemSymbols(contextOn(fake), { code: CODE }),
      TURNS,
    );
    const expected = await sequentialWithFailed(
      handleGetAbapSystemSymbols,
      { code: CODE },
      phasesOf(fake)[0] as string[],
    );
    expectEnvelopeFailure(result, expected, 4);
    const symbols = (result as any).content[0].json.symbols;
    expect(
      symbols
        .filter((s: { error?: unknown }) => s.error !== undefined)
        .map((s: { name: string }) => s.name),
    ).toEqual(['ZCL_A', 'ZIF_A', 'ZCL_B', 'ZCL_GONE']);
    expect(fake.envelopes).toHaveLength(1);
    expect(fake.directs).toHaveLength(0);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const { fake, context, result, expected } = await noCommunicationBatch(
      handleGetAbapSystemSymbols,
      { code: CODE },
    );
    expect(contentOf(result)).toBe(contentOf(expected));
    expect(fake.envelopes).toHaveLength(1);
    expect(directsOf(fake)).toEqual([
      'src:class:ZCL_A',
      'src:intf:ZIF_A',
      'src:class:ZCL_B',
      'src:class:ZCL_GONE',
    ]);
    expect(context.batchAvailability?.available()).toBe(false);
  });
});
