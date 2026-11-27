/**
 * Where-used and the runtime feeds on internal batches (spec §11, rows
 * `GetWhereUsed` and `RuntimeListFeeds`): each phase's independent reads go
 * in one envelope; the answer is the sequential version's; a part's failure
 * is its object's (or feed's); a credential refusal ends the call as it
 * came; a destination with no communication batch runs the sequential
 * reads.
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
import * as z from 'zod';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  TOOL_DEFINITION as GET_WHERE_USED,
  handleGetWhereUsed as getWhereUsed,
} from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  TOOL_DEFINITION as RUNTIME_LIST_FEEDS,
  handleRuntimeListFeeds as runtimeListFeeds,
} from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import { createBatchAvailability } from '../../../lib/batch/availability';
import { eligible } from '../../../lib/batch/eligibility';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import { child, listOf } from '../../../lib/thrownValue';
import { assertMatchObject, rejectionOf } from '../../helpers/assertions';
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

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

// ---------------------------------------------------------------------------
// The model, by request label
// ---------------------------------------------------------------------------

const FEED_KINDS: Record<string, string> = {
  '/sap/bc/adt/runtime/dumps': 'dumps',
  '/sap/bc/adt/runtime/systemmessages': 'messages',
  '/sap/bc/adt/gw/errorlog': 'gateway',
};

/**
 * A request's label: `scope:<name>` (a where-used scope), `wu:<name>` (an
 * unscoped where-used request), `wu:<name>:<selected types>` (a scoped one,
 * the types its scope selects), `feeds` (the feed list),
 * `feed:<kind>:<top>:<to>` (a page of a feed).
 */
function labelOf(
  method: string,
  url: string,
  params?: unknown,
  body = '',
): string {
  const parsed = new URL(url, 'https://system.invalid');
  const query = new URLSearchParams(parsed.search);
  for (const [k, v] of Object.entries(
    (params ?? {}) as Record<string, unknown>,
  )) {
    if (v !== undefined) query.set(k, String(v));
  }
  const path = decodeURIComponent(parsed.pathname);
  if (path.includes('/usageReferences')) {
    const name = (query.get('uri') ?? '').split('/').pop()?.toUpperCase();
    if (path.endsWith('/scope')) return `scope:${name}`;
    return body.includes(':scope')
      ? `wu:${name}:${selectedTypes(body).join(',')}`
      : `wu:${name}`;
  }
  if (path === '/sap/bc/adt/feeds') return 'feeds';
  const kind = FEED_KINDS[path];
  if (kind !== undefined) {
    return `feed:${kind}:${query.get('$top') ?? ''}:${query.get('to') ?? ''}`;
  }
  return `${method} ${path}`;
}

/** The types a scope selects (`isSelected="true"`), in the order it lists them. */
function selectedTypes(scopeXml: string): string[] {
  return [...scopeXml.matchAll(/<[\w-]+:type\b[^>]*\/>/g)]
    .filter((m) => m[0].includes('isSelected="true"'))
    .map((m) => /\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
}

const xml = { 'content-type': 'application/xml' };
const atom = { 'content-type': 'application/atom+xml;type=feed' };

const ok = (body: string, headers = xml): PartAnswer => ({
  status: 200,
  statusText: 'OK',
  headers,
  body,
});

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

// Where-used ----------------------------------------------------------------

/** The searchable types of every object's scope; the default selection first. */
const SCOPE_TYPES = [
  { name: 'CLAS/OC', selected: true },
  { name: 'PROG/P', selected: true },
  { name: 'TABL/DS', selected: false },
  { name: 'DDLS/DF', selected: false },
];

const scopeXml = (name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectTypes>${SCOPE_TYPES.map(
    (t) =>
      `<usagereferences:type isDefault="${t.selected}" isSelected="${t.selected}" name="${t.name}"/>`,
  ).join(
    '',
  )}</usagereferences:objectTypes><usagereferences:payload>${name}</usagereferences:payload></usagereferences:usageScopeResult>`;

/** Every object's references; a scoped request answers those of its selected types. */
const REFERENCES: Record<string, Array<{ name: string; type: string }>> = {
  ZT_A: [
    { name: 'ZCL_USER_A', type: 'CLAS/OC' },
    { name: 'ZPROG_A', type: 'PROG/P' },
    { name: 'ZS_A', type: 'TABL/DS' },
  ],
  ZT_B: [
    { name: 'ZCL_USER_B', type: 'CLAS/OC' },
    { name: 'ZDDL_B', type: 'DDLS/DF' },
  ],
  ZT_C: [{ name: 'ZS_C', type: 'TABL/DS' }],
};

const whereUsedXml = (refs: Array<{ name: string; type: string }>) =>
  `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core" numberOfResults="${refs.length}" resultDescription="${refs.length} references"><usagereferences:referencedObjects>${refs
    .map(
      (r) =>
        `<usagereferences:referencedObject uri="/sap/bc/adt/x/${r.name.toLowerCase()}" usageInformation="gradeDirect"><usagereferences:adtObject adtcore:name="${r.name}" adtcore:type="${r.type}"><adtcore:packageRef adtcore:name="ZPKG"/></usagereferences:adtObject></usagereferences:referencedObject>`,
    )
    .join(
      '',
    )}</usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;

/** A where-used answer by its label: unscoped all references, scoped those selected. */
function whereUsedAnswer(label: string): PartAnswer | undefined {
  const [kind, name = '', selected] = label.split(':');
  const refs = REFERENCES[name];
  if (refs === undefined) return undefined;
  if (kind === 'scope') return ok(scopeXml(name));
  if (kind !== 'wu') return undefined;
  if (selected === undefined) return ok(whereUsedXml(refs));
  const types = new Set(selected.split(','));
  return ok(whereUsedXml(refs.filter((r) => types.has(r.type))));
}

// Feeds ---------------------------------------------------------------------

const FEED_URLS: Record<string, string> = {
  dumps: '/sap/bc/adt/runtime/dumps',
  messages: '/sap/bc/adt/runtime/systemmessages',
  gateway: '/sap/bc/adt/gw/errorlog',
};

/** `n` entries one second apart, newest first, from `start`; the first `crowd` share its second. */
function entries(kind: string, n: number, crowd = 0) {
  const start = Date.UTC(2026, 9, 1, 7, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const second = i < crowd ? 0 : i;
    return {
      id: `${FEED_URLS[kind]}/ID${kind.toUpperCase()}${i}`,
      updated: new Date(start - second * 1000)
        .toISOString()
        .replace('.000', ''),
    };
  });
}

/** Every feed's entries. */
const FEEDS: Record<string, ReturnType<typeof entries>> = {
  dumps: entries('dumps', 230),
  messages: entries('messages', 7),
  gateway: entries('gateway', 120),
};

const boundOf = (stamp: string) => stamp.replace(/\D/g, '').slice(0, 14);

/** A page as SAP answers it: up to 100 entries at or before `to`, and the next link of a full one. */
function feedAnswer(
  feed: ReturnType<typeof entries>,
  kind: string,
  top: number,
  to: string,
): PartAnswer {
  const within = to ? feed.filter((e) => boundOf(e.updated) <= to) : feed;
  const page = within.slice(0, Math.min(top || 50, 100));
  const last = page[page.length - 1];
  const next =
    within.length > page.length && last !== undefined
      ? `<atom:link href="${FEED_URLS[kind]}?$top=100&amp;to=${boundOf(last.updated)}" rel="next"/>`
      : '';
  return ok(
    `<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom">${next}${page
      .map(
        (e) =>
          `<atom:entry><atom:id>${e.id}</atom:id><atom:title>${e.id.split('/').pop()}</atom:title><atom:updated>${e.updated}</atom:updated><atom:author><atom:name>SAPUSER01</atom:name></atom:author></atom:entry>`,
      )
      .join('')}</atom:feed>`,
    atom,
  );
}

const DESCRIPTORS = ok(
  '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry><atom:id>/sap/bc/adt/runtime/dumps</atom:id><atom:title>ABAP Runtime Errors</atom:title><atom:link href="/sap/bc/adt/runtime/dumps"/></atom:entry></atom:feed>',
  atom,
);

interface Model {
  /** Answers replacing the model's, by label. */
  answers?: Record<string, PartAnswer>;
  /** Feeds replacing the model's, by kind. */
  feeds?: Record<string, ReturnType<typeof entries>>;
  /** Answers replacing the model's, by a label's start (`feed:messages`). */
  startingWith?: Record<string, PartAnswer>;
}

function answerOf(model: Model, label: string): PartAnswer {
  const given = model.answers?.[label];
  if (given !== undefined) return given;
  for (const [start, answer] of Object.entries(model.startingWith ?? {})) {
    if (label.startsWith(start)) return answer;
  }
  if (label === 'feeds') return DESCRIPTORS;
  if (label.startsWith('feed:')) {
    const [, kind = '', top = '', to = ''] = label.split(':');
    const feed = model.feeds?.[kind] ?? FEEDS[kind];
    if (feed !== undefined) return feedAnswer(feed, kind, Number(top), to);
  }
  return (
    whereUsedAnswer(label) ?? { status: 404, statusText: 'Not Found', body: '' }
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
      return envelopeResponse(parts.map((p) => answerOf(model, partLabel(p))));
    },
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      const a = answerOf(model, directLabel(request));
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

const partLabel = (p: InnerRequest) =>
  labelOf(p.method, p.url, undefined, p.body);
const directLabel = (r: IAbapRequestOptions) =>
  labelOf(r.method, r.url, r.params, String(r.data ?? ''));

type Fake = ReturnType<typeof system>;

/** A context on the fake: batch served (default) or known to be absent. */
function contextOn(
  fake: Fake,
  batch: 'served' | 'absent' = 'served',
  partsPerEnvelope?: number,
): HandlerContext {
  const port = createBatchAvailability();
  if (batch === 'absent') port.noteOuterStatus(404);
  return {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: port,
    ...(partsPerEnvelope !== undefined && { partsPerEnvelope }),
  };
}

/**
 * `handler(args)` without a bound and with the consumer's bound of 2 parts:
 * the same answer, every bounded envelope within 2 parts, and the unbounded
 * call sending an envelope of more (so the bound had something to split).
 */
async function boundHolds(
  handler: (context: HandlerContext, args: any) => Promise<unknown>,
  args: Record<string, unknown>,
  turns: number,
) {
  const free = system();
  const bounded = system();
  const a = await withinTurns(handler(contextOn(free), args), turns);
  const b = await withinTurns(
    handler(contextOn(bounded, 'served', 2), args),
    turns,
  );
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  assert.ok(free.envelopes.some((e) => e.parts.length > 2));
  assert.ok(bounded.envelopes.every((e) => e.parts.length <= 2));
  assert.ok(bounded.envelopes.length > free.envelopes.length);
}

const textOf = (result: unknown): string =>
  String(
    (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '',
  );
const payloadOf = (result: unknown) => JSON.parse(textOf(result));

/** Every envelope's parts, by label, in the order sent. */
const phasesOf = (fake: Fake) =>
  fake.envelopes.map((e: SeenEnvelope) => e.parts.map(partLabel));

/** The sequential version's requests, by label, in the order sent. */
const directsOf = (fake: Fake) => fake.directs.map(directLabel);

const TURNS = 20000;

type Handler = (context: HandlerContext, args: any) => Promise<unknown>;

/**
 * The handlers, taking any arguments: a case may give a malformed call.
 * Where-used is asked at `detail: 'full'`, the answer before `detail` that
 * these cases compare (terse answers, step 3), unless a case states its own.
 */
const handleGetWhereUsed: Handler = (context, args) =>
  getWhereUsed(context, { detail: 'full', ...args });
const handleRuntimeListFeeds: Handler = (context, args) =>
  runtimeListFeeds(context, { detail: 'full', ...args } as Parameters<
    typeof runtimeListFeeds
  >[1]);

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

/** Both answers equal, and each version sent only its own kind of request. */
function expectSame({
  a,
  b,
  batched,
  sequential,
}: Awaited<ReturnType<typeof bothWays>>) {
  assert.equal(textOf(a), textOf(b));
  assert.equal(
    (a as { isError?: boolean }).isError,
    (b as { isError?: boolean }).isError,
  );
  assert.equal(batched.directs.length, 0);
  assert.ok(batched.envelopes.length > 0);
  assert.equal(sequential.envelopes.length, 0);
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

/** The sequential answer with each of `labels` answered `500` on its own. */
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

/** The sequential answer with each of `labels` refused by the connection: its credential refusal thrown. */
async function sequentialWithThrown(
  handler: Handler,
  args: Record<string, unknown>,
  labels: string[],
) {
  const fake = system();
  fake.answerRequests(async (request, previous) => {
    if (labels.includes(directLabel(request))) throw credential();
    return previous(request);
  });
  return withinTurns(handler(contextOn(fake, 'absent'), args), TURNS);
}

/** A system whose envelope number `failing` fails as a whole (`500`). */
function failingEnvelope(failing: number) {
  return system({}, (parts, index) => {
    if (index === failing) throw statusError(500, 'Internal Server Error');
    return envelopeResponse(parts.map((p) => answerOf({}, partLabel(p))));
  });
}

/** A system that throws the connection's credential refusal on envelope `failing`. */
function refusingEnvelope(failing: number) {
  return system({}, (parts, index) => {
    if (index === failing) throw credential();
    return envelopeResponse(parts.map((p) => answerOf({}, partLabel(p))));
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
// GetWhereUsed
// ---------------------------------------------------------------------------

const table = (name: string) => ({ object_name: name, object_type: 'table' });
const THREE = [table('ZT_A'), table('ZT_B'), table('ZT_C')];

describe('GetWhereUsed', () => {
  for (const [args] of [
    [{ ...table('ZT_A'), enable_only_types: ['TABL/DS', 'CLAS/OC'] }],
    [{ ...table('ZT_A'), enable_all_types: true }],
    [{ ...table('ZT_B'), disable_types: ['CLAS/OC'] }],
    [{ ...table('ZT_A'), enable_only_types: ['BOGUS/XX'] }],
    [{ ...table('ZT_GONE'), enable_all_types: true }],
    [{ objects: THREE }],
    [{ objects: THREE, enable_only_types: ['TABL/DS', 'DDLS/DF'] }],
    [{ objects: THREE, enable_all_types: true, disable_types: ['PROG/P'] }],
    [{ objects: [table('ZT_A'), table('ZT_GONE'), table('ZT_C')] }],
    [
      {
        objects: [table('ZT_A'), { object_name: 'ZT_B' }, table('ZT_C')],
        enable_only_types: ['CLAS/OC'],
      },
    ],
    [{ objects: [table('ZT_A')], enable_all_types: true }],
  ] satisfies ReadonlyArray<[Record<string, unknown>]>) {
    it(format('same answer as the sequential version: %j', args), async () => {
      expectSame(await bothWays(handleGetWhereUsed, args));
    });
  }

  it('with a filter, two phases: every object’s scope, then every scoped request', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetWhereUsed(contextOn(fake), {
        objects: THREE,
        enable_only_types: ['TABL/DS', 'DDLS/DF'],
      }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake), [
      ['scope:ZT_A', 'scope:ZT_B', 'scope:ZT_C'],
      [
        'wu:ZT_A:TABL/DS,DDLS/DF',
        'wu:ZT_B:TABL/DS,DDLS/DF',
        'wu:ZT_C:TABL/DS,DDLS/DF',
      ],
    ]);
    assert.deepStrictEqual(
      payloadOf(result).map((e: { references: Array<{ name: string }> }) =>
        e.references.map((r) => r.name),
      ),
      [['ZS_A'], ['ZDDL_B'], ['ZS_C']],
    );
  });

  it('without a filter, one phase: every object’s where-used request', async () => {
    const fake = system();
    await withinTurns(
      handleGetWhereUsed(contextOn(fake), { objects: THREE }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake), [['wu:ZT_A', 'wu:ZT_B', 'wu:ZT_C']]);
  });

  it('enable_only_types: each scope is read once; the sequential version reads it twice', async () => {
    const args = { ...table('ZT_A'), enable_only_types: ['CLAS/OC'] };
    const { batched, sequential } = await bothWays(handleGetWhereUsed, args);
    assert.deepStrictEqual(phasesOf(batched), [
      ['scope:ZT_A'],
      ['wu:ZT_A:CLAS/OC'],
    ]);
    assert.deepStrictEqual(directsOf(sequential), [
      'scope:ZT_A',
      'scope:ZT_A',
      'wu:ZT_A:CLAS/OC',
    ]);
  });

  it('several objects share the envelopes: their count does not grow with the number of objects', async () => {
    for (const objects of [[table('ZT_A')], THREE]) {
      const filtered = system();
      await withinTurns(
        handleGetWhereUsed(contextOn(filtered), {
          objects,
          enable_all_types: true,
        }),
        TURNS,
      );
      assert.equal(filtered.envelopes.length, 2);
      assert.deepStrictEqual(
        filtered.envelopes.map((e) => e.parts.length),
        [objects.length, objects.length],
      );
      const unfiltered = system();
      await withinTurns(
        handleGetWhereUsed(contextOn(unfiltered), { objects }),
        TURNS,
      );
      assert.equal(unfiltered.envelopes.length, 1);
      assert.equal(filtered.directs.length, 0);
      assert.equal(unfiltered.directs.length, 0);
    }
  });

  it('one object without a filter is its one request, sent as itself', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetWhereUsed(contextOn(fake), table('ZT_A')),
      TURNS,
    );
    assert.equal(fake.envelopes.length, 0);
    assert.deepStrictEqual(directsOf(fake), ['wu:ZT_A']);
    assert.equal(payloadOf(result).total_references, 3);
  });

  it('the single argument keeps its answer; the list answers one entry per object, in order', async () => {
    const fake = system();
    const single = await withinTurns(
      handleGetWhereUsed(contextOn(fake), {
        ...table('ZT_B'),
        enable_all_types: true,
      }),
      TURNS,
    );
    const list = await withinTurns(
      handleGetWhereUsed(contextOn(system()), {
        objects: [table('ZT_C'), table('ZT_B')],
        enable_all_types: true,
      }),
      TURNS,
    );
    assertMatchObject(payloadOf(single), {
      object_name: 'ZT_B',
      total_references: 2,
    });
    assert.deepStrictEqual(payloadOf(list)[1], payloadOf(single));
    assert.deepStrictEqual(
      payloadOf(list).map((e: { object_name: string }) => e.object_name),
      ['ZT_C', 'ZT_B'],
    );
  });

  it('enable_only_types the scope does not offer: that object’s error, no search for it', async () => {
    const fake = system({
      answers: {
        'scope:ZT_B': ok(
          scopeXml('ZT_B').replace('name="DDLS/DF"', 'name="X"'),
        ),
      },
    });
    const result = await withinTurns(
      handleGetWhereUsed(contextOn(fake), {
        objects: THREE,
        enable_only_types: ['DDLS/DF'],
      }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake)[1], [
      'wu:ZT_A:DDLS/DF',
      'wu:ZT_C:DDLS/DF',
    ]);
    const entries = payloadOf(result);
    assertMatchObject(entries[1], { object_name: 'ZT_B' });
    assert.ok(String(entries[1].error).includes('DDLS/DF'));
  });

  for (const [label, filter] of [
    ['scope:ZT_B', { enable_only_types: ['CLAS/OC'] }],
    ['scope:ZT_B', { disable_types: ['CLAS/OC'] }],
    ['wu:ZT_B:CLAS/OC', { enable_only_types: ['CLAS/OC'] }],
    ['wu:ZT_B', {}],
  ] satisfies ReadonlyArray<[string, Record<string, unknown>]>) {
    it(
      format(
        "a part's failure (%s) is that object's: its error entry, the rest answers, as the sequential version",
        label,
      ),
      async () => {
        const outcome = await bothWays(
          handleGetWhereUsed,
          { objects: THREE, ...filter },
          { answers: { [label]: FORBIDDEN } },
        );
        expectSame(outcome);
        const entries = payloadOf(outcome.a);
        assertMatchObject(entries[1], {
          object_name: 'ZT_B',
          error: { status: 403 },
        });
        assert.ok(entries[0].references.length > 0);
        assertMatchObject(entries[2], { object_name: 'ZT_C' });
        assert.equal(entries[2].error, undefined);
      },
    );
  }

  for (const [label, filter, envelopes] of [
    ['scope:ZT_B', { enable_only_types: ['CLAS/OC'] }, 1],
    ['scope:ZT_B', { enable_all_types: true }, 1],
    ['wu:ZT_B:CLAS/OC', { enable_only_types: ['CLAS/OC'] }, 2],
    ['wu:ZT_B', {}, 1],
  ] satisfies ReadonlyArray<[string, Record<string, unknown>, number]>) {
    it(
      format(
        'a 401 SAP answered to %s ends the call as it came; nothing is read after it',
        label,
      ),
      async () => {
        const outcome = await bothWays(
          handleGetWhereUsed,
          { objects: THREE, ...filter },
          { answers: { [label]: UNAUTHORIZED } },
        );
        expectSame(outcome);
        assertMatchObject(payloadOf(outcome.a), { status: 401 });
        assert.equal(outcome.batched.envelopes.length, envelopes);
      },
    );
  }

  it("the connection's credential refusal ends the call as it came", async () => {
    for (const [failing, filter] of [
      [1, {}],
      [1, { enable_all_types: true }],
      [2, { enable_all_types: true }],
      [2, { enable_only_types: ['CLAS/OC'] }],
    ] as const) {
      const args = { objects: THREE, ...filter };
      const fake = refusingEnvelope(failing);
      const result = await withinTurns(
        handleGetWhereUsed(contextOn(fake), args),
        TURNS,
      );
      const expected = await sequentialWithThrown(
        handleGetWhereUsed,
        args,
        phasesOf(fake)[failing - 1] as string[],
      );
      assert.deepStrictEqual(wholeOf(result), wholeOf(expected));
      assert.equal(payloadOf(result).error, 'authentication_failed');
      assert.equal(fake.envelopes.length, failing);
    }
  });

  for (const [label, filter] of [
    ['wu:ZT_C', {}],
    ['wu:ZT_C:CLAS/OC', { enable_only_types: ['CLAS/OC'] }],
  ] satisfies ReadonlyArray<[string, Record<string, unknown>]>) {
    it(
      format(
        'a 401 SAP answered to %s: the cache holds what the sequential version leaves in it',
        label,
      ),
      async () => {
        const args = { objects: THREE, ...filter };
        const model = { answers: { [label]: UNAUTHORIZED } };
        objectsListCache.clearCache();
        const batched = await withinTurns(
          handleGetWhereUsed(contextOn(system(model)), args),
          TURNS,
        );
        const batchedCache = objectsListCache.getCache();
        objectsListCache.clearCache();
        const sequential = await withinTurns(
          handleGetWhereUsed(contextOn(system(model), 'absent'), args),
          TURNS,
        );
        const sequentialCache = objectsListCache.getCache();
        objectsListCache.clearCache();
        assert.deepStrictEqual(wholeOf(batched), wholeOf(sequential));
        assertMatchObject(payloadOf(batched), { status: 401 });
        assert.deepStrictEqual(batchedCache, sequentialCache);
        assertMatchObject(
          child(listOf(child(batchedCache, 'content'))[0], 'json'),
          {
            object_name: 'ZT_B',
          },
        );
      },
    );
  }

  it('401s in two phases: the batched call ends at the first 401 of the phase that met it, in the order of the objects', async () => {
    const outcome = await bothWays(
      handleGetWhereUsed,
      { objects: THREE, enable_only_types: ['CLAS/OC'] },
      {
        answers: {
          'scope:ZT_B': UNAUTHORIZED,
          'scope:ZT_C': UNAUTHORIZED,
          'wu:ZT_A:CLAS/OC': UNAUTHORIZED,
        },
      },
    );
    // Batched: the scopes' phase meets the 401s of ZT_B and ZT_C and ends at
    // ZT_B's, the first in the order of the objects; ZT_A's scoped request
    // is never sent.
    assert.deepStrictEqual(phasesOf(outcome.batched), [
      ['scope:ZT_A', 'scope:ZT_B', 'scope:ZT_C'],
    ]);
    assertMatchObject(payloadOf(outcome.a), {
      status: 401,
      step: 'read where-used scope',
    });
    assert.ok(JSON.stringify(payloadOf(outcome.a).request).includes('zt_b'));
    // Sequential: ZT_A is read first, and its scoped request's 401 ends it.
    assertMatchObject(payloadOf(outcome.b), {
      status: 401,
      step: 'read where-used',
    });
    assert.ok(JSON.stringify(payloadOf(outcome.b).request).includes('zt_a'));
  });

  it('a refusal the connection throws to the validating scope read is thrown, as the sequential version throws it', async () => {
    const args = { objects: THREE, enable_only_types: ['CLAS/OC'] };
    const batched = refusingEnvelope(1);
    const rejected = rejectionOf(
      withinTurns(handleGetWhereUsed(contextOn(batched), args), TURNS),
    );
    assert.ok((await rejected) instanceof AuthRefusedError);
    const sequential = system();
    sequential.answerRequests(async () => {
      throw credential();
    });
    assert.ok(
      (await rejectionOf(
        withinTurns(
          handleGetWhereUsed(contextOn(sequential, 'absent'), args),
          TURNS,
        ),
      )) instanceof AuthRefusedError,
    );
  });

  for (const [failing, filter] of [
    [1, {}],
    [1, { enable_all_types: true }],
    [2, { enable_all_types: true }],
    [2, { enable_only_types: ['CLAS/OC'] }],
  ] satisfies ReadonlyArray<[number, Record<string, unknown>]>) {
    it(
      format(
        "envelope %i failing is every part's failure; the answer is the sequential one with those reads failed (%j)",
        failing,
        filter,
      ),
      async () => {
        const args = { objects: THREE, ...filter };
        const fake = failingEnvelope(failing);
        const result = await withinTurns(
          handleGetWhereUsed(contextOn(fake), args),
          TURNS,
        );
        const expected = await sequentialWithFailed(
          handleGetWhereUsed,
          args,
          phasesOf(fake)[failing - 1] as string[],
        );
        expectEnvelopeFailure(result, expected, THREE.length);
        assertMatchObject(payloadOf(result)[0].error, { status: 500 });
        assert.equal(fake.envelopes.length, failing);
        assert.equal(fake.directs.length, 0);
      },
    );
  }

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const { fake, context, result, expected } = await noCommunicationBatch(
      handleGetWhereUsed,
      { objects: THREE, enable_all_types: true },
    );
    assert.equal(textOf(result), textOf(expected));
    assert.equal(fake.envelopes.length, 1);
    assert.deepStrictEqual(directsOf(fake), [
      'scope:ZT_A',
      'wu:ZT_A:CLAS/OC,PROG/P,TABL/DS,DDLS/DF',
      'scope:ZT_B',
      'wu:ZT_B:CLAS/OC,PROG/P,TABL/DS,DDLS/DF',
      'scope:ZT_C',
      'wu:ZT_C:CLAS/OC,PROG/P,TABL/DS,DDLS/DF',
    ]);
    assert.equal(context.batchAvailability?.available(), false);
  });

  it('exactly one of object_name/object_type or objects: its schema', () => {
    for (const args of [
      { objects: THREE, object_name: 'ZT_A' },
      { objects: [] },
    ]) {
      assert.ok(
        schemaWords(GET_WHERE_USED, args).includes('Give exactly one of'),
      );
    }
    // Not a list at all: the schema's own type words.
    assert.notEqual(schemaWords(GET_WHERE_USED, { objects: 'ZT_A' }), '');
  });
});

// ---------------------------------------------------------------------------
// RuntimeListFeeds
// ---------------------------------------------------------------------------

const PAGED = ['dumps', 'system_messages', 'gateway_errors'];

describe('RuntimeListFeeds', () => {
  for (const [args, model] of [
    [{ feed_type: 'dumps' }, {}],
    [{ feed_type: 'dumps', max_results: 230 }, {}],
    [{ feed_type: 'system_messages', max_results: 5 }, {}],
    [{ feed_type: 'gateway_errors', max_results: 110 }, {}],
    [
      { feed_type: 'dumps', max_results: 3 },
      { feeds: { dumps: entries('dumps', 120, 105) } },
    ],
    [{ feed_types: PAGED, max_results: 150 }, {}],
    [{ feed_types: [...PAGED, 'descriptors', 'variants'] }, {}],
    [{ feed_types: ['dumps', 'system_messages'], runtime_error: 'X' }, {}],
    [{ feed_types: ['gateway_errors'], max_results: 10 }, {}],
  ] satisfies ReadonlyArray<[Record<string, unknown>, Model]>) {
    it(format('same answer as the sequential version: %j', args), async () => {
      expectSame(await bothWays(handleRuntimeListFeeds, args, model));
    });
  }

  it('phases: every feed’s first page, then per round the next page of every feed still paging', async () => {
    const fake = system();
    await withinTurns(
      handleRuntimeListFeeds(contextOn(fake), {
        feed_types: PAGED,
        max_results: 230,
      }),
      TURNS,
    );
    assert.deepStrictEqual(phasesOf(fake), [
      ['feed:dumps:100:', 'feed:messages:100:', 'feed:gateway:100:'],
      ['feed:dumps:100:20261001065821', 'feed:gateway:100:20261001065821'],
      ['feed:dumps:33:20261001065642'],
    ]);
  });

  it('several feeds share the rounds: the envelope count is the longest feed’s page count', async () => {
    const one = system();
    await withinTurns(
      handleRuntimeListFeeds(contextOn(one), {
        feed_type: 'dumps',
        max_results: 230,
      }),
      TURNS,
    );
    const three = system();
    await withinTurns(
      handleRuntimeListFeeds(contextOn(three), {
        feed_types: PAGED,
        max_results: 230,
      }),
      TURNS,
    );
    assert.equal(three.envelopes.length, one.envelopes.length);
    assert.equal(one.directs.length, 0);
    assert.equal(three.directs.length, 0);
  });

  for (const [args] of [
    [{}],
    [{ feed_type: 'descriptors' }],
    [{ feed_type: 'variants' }],
  ]) {
    it(
      format('a feed of one request is sent as itself: %j', args),
      async () => {
        const fake = system();
        const result = await withinTurns(
          handleRuntimeListFeeds(contextOn(fake), args),
          TURNS,
        );
        assert.equal(fake.envelopes.length, 0);
        assert.deepStrictEqual(directsOf(fake), ['feeds']);
        assert.equal((result as { isError?: boolean }).isError, false);
      },
    );
  }

  it('the single argument keeps its answer; the list answers one entry per feed, in order', async () => {
    const single = await withinTurns(
      handleRuntimeListFeeds(contextOn(system()), {
        feed_type: 'system_messages',
      }),
      TURNS,
    );
    const list = await withinTurns(
      handleRuntimeListFeeds(contextOn(system()), {
        feed_types: ['dumps', 'system_messages'],
      }),
      TURNS,
    );
    assertMatchObject(payloadOf(single), {
      feed_type: 'system_messages',
      count: 7,
    });
    assert.deepStrictEqual(payloadOf(list)[1], payloadOf(single));
    assert.deepStrictEqual(
      payloadOf(list).map((e: { feed_type: string }) => e.feed_type),
      ['dumps', 'system_messages'],
    );
  });

  it("a part's failure is that feed's: its error entry, the rest answers, as the sequential version", async () => {
    const outcome = await bothWays(
      handleRuntimeListFeeds,
      { feed_types: PAGED, max_results: 150 },
      { startingWith: { 'feed:gateway:52:2026': FORBIDDEN } },
    );
    expectSame(outcome);
    const entries = payloadOf(outcome.a);
    assertMatchObject(entries[2], {
      feed_type: 'gateway_errors',
      error: { status: 403 },
    });
    assert.ok(entries[0].count > 100);
  });

  for (const [start, envelopes] of [
    ['feed:messages', 1],
    ['feed:dumps:100:2026', 2],
  ] satisfies ReadonlyArray<[string, number]>) {
    it(
      format(
        'a 401 SAP answered to %s ends the call as it came; no further round is sent',
        start,
      ),
      async () => {
        const outcome = await bothWays(
          handleRuntimeListFeeds,
          { feed_types: PAGED, max_results: 230 },
          { startingWith: { [start]: UNAUTHORIZED } },
        );
        expectSame(outcome);
        assertMatchObject(payloadOf(outcome.a), { status: 401 });
        assert.equal(outcome.batched.envelopes.length, envelopes);
      },
    );
  }

  it("the connection's credential refusal ends the call as it came", async () => {
    for (const [failing, args] of [
      [1, { feed_type: 'dumps' }],
      [1, { feed_types: PAGED, max_results: 230 }],
      [2, { feed_types: PAGED, max_results: 230 }],
    ] as const) {
      const fake = refusingEnvelope(failing);
      const result = await withinTurns(
        handleRuntimeListFeeds(contextOn(fake), args as never),
        TURNS,
      );
      const expected = await sequentialWithThrown(
        handleRuntimeListFeeds,
        args,
        phasesOf(fake)[failing - 1] as string[],
      );
      assert.deepStrictEqual(wholeOf(result), wholeOf(expected));
      assert.equal(payloadOf(result).error, 'authentication_failed');
      assert.equal(fake.envelopes.length, failing);
    }
  });

  for (const [failing, failures] of [
    [1, 3],
    [2, 2],
  ]) {
    it(
      format(
        "envelope %i failing is every part's failure; the answer is the sequential one with those reads failed",
        failing,
      ),
      async () => {
        const args = { feed_types: PAGED, max_results: 150 };
        const fake = failingEnvelope(failing);
        const result = await withinTurns(
          handleRuntimeListFeeds(contextOn(fake), args),
          TURNS,
        );
        const expected = await sequentialWithFailed(
          handleRuntimeListFeeds,
          args,
          phasesOf(fake)[failing - 1] as string[],
        );
        expectEnvelopeFailure(result, expected, failures);
        assertMatchObject(payloadOf(result)[0].error, { status: 500 });
        assert.equal(fake.envelopes.length, failing);
        assert.equal(fake.directs.length, 0);
      },
    );
  }

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const { fake, context, result, expected } = await noCommunicationBatch(
      handleRuntimeListFeeds,
      { feed_types: ['dumps', 'system_messages'], max_results: 150 },
    );
    assert.equal(textOf(result), textOf(expected));
    assert.equal(fake.envelopes.length, 1);
    assert.deepStrictEqual(directsOf(fake), [
      'feed:dumps:100:',
      'feed:dumps:52:20261001065821',
      'feed:messages:100:',
    ]);
    assert.equal(context.batchAvailability?.available(), false);
  });

  it('exactly one of feed_type or feed_types: its schema', () => {
    for (const args of [
      { feed_types: PAGED, feed_type: 'dumps' },
      { feed_types: [] },
    ]) {
      assert.ok(
        schemaWords(RUNTIME_LIST_FEEDS, args).includes('Give exactly one of'),
      );
    }
    assert.notEqual(
      schemaWords(RUNTIME_LIST_FEEDS, { feed_types: 'dumps' }),
      '',
    );
  });

  it('feed_types through the registered schema arrives alone; feed_type absent reads descriptors', async () => {
    const schema = RUNTIME_LIST_FEEDS.inputSchema;
    const listed = schema.parse({ feed_types: PAGED });
    assert.deepStrictEqual(listed, { feed_types: PAGED, detail: 'terse' });
    const fake = system();
    const result = await withinTurns(
      handleRuntimeListFeeds(contextOn(fake), listed as never),
      TURNS,
    );
    assert.ok(!(result as { isError?: boolean }).isError);
    // The schema's default is terse: one `# feed` block per feed, in order.
    assert.deepStrictEqual(
      textOf(result)
        .split('\n')
        .filter((line) => line.startsWith('# feed ')),
      PAGED.map((feed) => `# feed ${feed}`),
    );
    assert.deepStrictEqual(schema.parse({}), { detail: 'terse' });
    const absent = await withinTurns(
      handleRuntimeListFeeds(contextOn(system()), {}),
      TURNS,
    );
    const descriptors = await withinTurns(
      handleRuntimeListFeeds(contextOn(system()), {
        feed_type: 'descriptors',
      }),
      TURNS,
    );
    assert.equal(textOf(absent), textOf(descriptors));
  });
});

// ---------------------------------------------------------------------------
// Batch mode
// ---------------------------------------------------------------------------

// Batch mode is the compact sets': their where-used and feed reads of one
// request are recorded; the full set's tools are not listed at all.
describe("the consumer's parts bound", () => {
  it('GetWhereUsed of three objects: envelopes of at most 2 parts, the same answer', async () => {
    await boundHolds(handleGetWhereUsed, { objects: THREE }, TURNS);
  });

  it('RuntimeListFeeds of three feeds: envelopes of at most 2 parts, the same answer', async () => {
    await boundHolds(
      handleRuntimeListFeeds,
      { feed_types: PAGED, max_results: 230 },
      TURNS,
    );
  });
});

describe('batch mode records the one-request calls only', () => {
  for (const [tool, args, recorded] of [
    [
      'HandlerSystem',
      { action: 'where_used', object_type: 'table', object_name: 'ZT_A' },
      true,
    ],
    [
      'HandlerSystem',
      {
        action: 'where_used',
        object_type: 'functionmodule',
        object_name: 'G|M',
      },
      false,
    ],
    ['HandlerDumpList', {}, true],
    ['HandlerDumpList', { feed_type: 'system_messages' }, true],
    ['GetWhereUsed', table('ZT_A'), false],
    ['GetWhereUsed', { objects: THREE }, false],
    ['RuntimeListFeeds', {}, false],
    ['RuntimeListFeeds', { feed_type: 'variants' }, false],
  ] satisfies ReadonlyArray<[string, Record<string, unknown>, boolean]>) {
    it(format('%s %j: recorded %s', tool, args, recorded), () => {
      assert.equal(eligible(tool, args, 'http').ok, recorded);
    });
  }
});
