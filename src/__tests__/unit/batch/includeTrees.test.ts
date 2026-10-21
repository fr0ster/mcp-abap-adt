/**
 * The include, structure and enhancement trees on internal batches (spec
 * §11, rows `GetIncludesList`, `GetStructuresList`, `GetEnhancements`): each
 * phase's independent reads go in one envelope, one level at a time; the
 * answer is the sequential version's; several objects share the envelopes;
 * a part's failure is its object's; a credential refusal ends the call as it
 * came; a destination with no communication batch runs the sequential reads.
 *
 * Real handlers, real clients, real `AdtBatchConnection`; only the
 * connection is a fake, answering from a small repository model — the same
 * model for an envelope's parts and for the sequential version's requests.
 */
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetEnhancements } from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import type { HandlerContext } from '../../../handlers/interfaces';
import { handleGetStructuresList } from '../../../handlers/structure/readonly/handleGetStructuresList';
import { createBatchAvailability } from '../../../lib/batch/availability';
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
// The repository model, by request label
// ---------------------------------------------------------------------------

/**
 * A request's label: what it reads, in a few words — `src:prog:<name>`,
 * `src:incl:<name>`, `meta:class|prog|incl:<name>`, `ns:<type>:<name>:<node>`
 * (root: no node), `ddl:structure|table:<name>`, `scope:…`, `wu:…`,
 * `elements:class|prog|fugr|incl:<name>`.
 */
function labelOf(method: string, url: string, params?: unknown): string {
  const parsed = new URL(url, 'https://system.invalid');
  const query = new URLSearchParams(parsed.search);
  for (const [k, v] of Object.entries(
    (params ?? {}) as Record<string, unknown>,
  )) {
    query.set(k, String(v));
  }
  const path = decodeURIComponent(parsed.pathname);
  const last = (prefix: string) =>
    path.slice(prefix.length).split('/')[0]?.toUpperCase() ?? '';
  if (path.endsWith('/repository/nodestructure')) {
    const id = query.get('node_id') ?? '';
    return `ns:${query.get('parent_type')}:${query.get('parent_name')}:${id === '' || Number(id) === 0 ? '' : String(Number(id))}`;
  }
  if (path.includes('/usageReferences')) {
    const uri = query.get('uri') ?? '';
    const type = uri.includes('/ddic/tables/') ? 'table' : 'structure';
    const name = uri.split('/').pop()?.toUpperCase() ?? '';
    return `${path.endsWith('/scope') ? 'scope' : 'wu'}:${type}:${name}`;
  }
  const kinds: Array<[string, string]> = [
    ['/sap/bc/adt/programs/programs/', 'prog'],
    ['/sap/bc/adt/programs/includes/', 'incl'],
    ['/sap/bc/adt/oo/classes/', 'class'],
    ['/sap/bc/adt/functions/groups/', 'fugr'],
    ['/sap/bc/adt/ddic/structures/', 'structure'],
    ['/sap/bc/adt/ddic/tables/', 'table'],
  ];
  for (const [prefix, kind] of kinds) {
    if (!path.startsWith(prefix)) continue;
    const name = last(prefix);
    if (path.endsWith('/enhancements/elements'))
      return `elements:${kind}:${name}`;
    if (kind === 'structure' || kind === 'table') return `ddl:${kind}:${name}`;
    if (path.endsWith('/source/main')) return `src:${kind}:${name}`;
    return `meta:${kind}:${name}`;
  }
  return `${method} ${path}`;
}

const xml = { 'content-type': 'application/xml' };
const text = { 'content-type': 'text/plain' };

const nodeXml = (
  objects: Array<{ type: string; name: string }>,
  types: Array<{ type: string; nodeId: string }> = [],
) =>
  `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>${objects
    .map(
      (o) =>
        `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${o.type}</OBJECT_TYPE><OBJECT_NAME>${o.name}</OBJECT_NAME><TECH_NAME>${o.name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${o.name.toLowerCase()}</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>`,
    )
    .join('')}</TREE_CONTENT><OBJECT_TYPES>${types
    .map(
      (t) =>
        `<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>${t.type}</OBJECT_TYPE><NODE_ID>${t.nodeId}</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>`,
    )
    .join('')}</OBJECT_TYPES></DATA></asx:values></asx:abap>`;

const whereUsedXml = (refs: Array<{ name: string; type: string }>) =>
  `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core" numberOfResults="${refs.length}"><usagereferences:referencedObjects>${refs
    .map(
      (r) =>
        `<usagereferences:referencedObject uri="/sap/bc/adt/x/${r.name.toLowerCase()}"><usagereferences:adtObject adtcore:name="${r.name}" adtcore:type="${r.type}"/></usagereferences:referencedObject>`,
    )
    .join(
      '',
    )}</usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;

const SCOPE_XML =
  '<?xml version="1.0" encoding="utf-8"?><usagereferences:usageScopeResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"/>';

const elementsXml = (name: string, source: string) =>
  `<?xml version="1.0" encoding="utf-8"?><enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements" xmlns:adtcore="http://www.sap.com/adt/core"><enh:enhancementImplementations adtcore:name="${name}" adtcore:type="ENHO/XHH"><enh:source>${Buffer.from(source).toString('base64')}</enh:source></enh:enhancementImplementations></enh:enhancements>`;

const includeMetaXml = (name: string, program: string) =>
  `<?xml version="1.0" encoding="utf-8"?><include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}"><include:contextRef adtcore:uri="/sap/bc/adt/programs/programs/${program.toLowerCase()}" adtcore:type="PROG/P" adtcore:name="${program}"/></include:abapInclude>`;

const ok = (body: string, headers = xml): PartAnswer => ({
  status: 200,
  statusText: 'OK',
  headers,
  body,
});

/** The repository: one answer per label; anything else is `404`. */
const REPOSITORY: Record<string, PartAnswer> = {
  // A program whose includes nest, repeat and cycle.
  'src:prog:ZPROG': ok(
    'REPORT zprog.\nINCLUDE zinc_a.\n* INCLUDE zcommented.\nINCLUDE zinc_b.\n',
    text,
  ),
  'src:incl:ZINC_A': ok('INCLUDE zinc_c.\nINCLUDE zinc_b.\n', text),
  'src:incl:ZINC_B': ok('INCLUDE zinc_d.\n', text),
  'src:incl:ZINC_C': ok('INCLUDE zinc_a.\n', text),
  'src:incl:ZINC_D': ok('DATA x TYPE i.\n', text),
  // A second program of the same depth.
  'src:prog:ZPROG2': ok('REPORT zprog2.\nINCLUDE zinc2_a.\n', text),
  'src:incl:ZINC2_A': ok('INCLUDE zinc2_b.\n', text),
  'src:incl:ZINC2_B': ok('DATA y TYPE i.\n', text),
  // A function group: its includes node, one include naming another.
  'ns:FUGR/F:ZFG:': ok(nodeXml([], [{ type: 'FUGR/I', nodeId: '000005' }])),
  'ns:FUGR/F:ZFG:5': ok(
    nodeXml([
      { type: 'FUGR/I', name: 'LZFGTOP' },
      { type: 'FUGR/I', name: 'LZFGUXX' },
      { type: 'FUGR/I', name: 'LZFGU01' },
    ]),
  ),
  'src:incl:LZFGTOP': ok('FUNCTION-POOL zfg.\n', text),
  'src:incl:LZFGUXX': ok('INCLUDE lzfgu01.\n', text),
  'src:incl:LZFGU01': ok('FUNCTION z_one.\nENDFUNCTION.\n', text),
  // A class: its sections.
  'meta:class:ZCL': ok(
    '<?xml version="1.0" encoding="utf-8"?><class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"><class:include class:includeType="definitions"/><class:include class:includeType="main"/></class:abapClass>',
  ),

  // Structures: ZS embeds ZINC1 (a structure) and ZINC2 (a table); both
  // embed ZINC3; ZAPP extends ZS, ZOTHER only refers to it.
  'ddl:structure:ZS': ok(
    'define structure zs {\n  include zinc1;\n  inc2 : include zinc2;\n}',
    text,
  ),
  'ddl:structure:ZINC1': ok(
    'define structure zinc1 {\n  include zinc3;\n}',
    text,
  ),
  'ddl:table:ZINC2': ok('define table zinc2 {\n  include zinc3;\n}', text),
  'ddl:structure:ZINC3': ok(
    'define structure zinc3 {\n  f : abap.int4;\n}',
    text,
  ),
  'ddl:structure:ZAPP': ok(
    'extend type zs with zapp {\n  zz : abap.int4;\n}',
    text,
  ),
  'ddl:structure:ZOTHER': ok('define structure zother {\n  g : zs;\n}', text),
  // A second structure of the same depth.
  'ddl:structure:ZS2': ok('define structure zs2 {\n  include zinc21;\n}', text),
  'ddl:structure:ZINC21': ok(
    'define structure zinc21 {\n  include zinc22;\n}',
    text,
  ),
  'ddl:structure:ZINC22': ok(
    'define structure zinc22 {\n  h : abap.int4;\n}',
    text,
  ),
  'scope:structure:ZS': ok(SCOPE_XML),
  'wu:structure:ZS': ok(
    whereUsedXml([
      { name: 'ZAPP', type: 'TABL/DS' },
      { name: 'ZOTHER', type: 'TABL/DS' },
      { name: 'ZPROGX', type: 'PROG/P' },
    ]),
  ),
  'scope:structure:ZINC1': ok(SCOPE_XML),
  'wu:structure:ZINC1': ok(whereUsedXml([])),
  'scope:table:ZINC2': ok(SCOPE_XML),
  'wu:table:ZINC2': ok(whereUsedXml([])),
  'scope:structure:ZINC3': ok(SCOPE_XML),
  'wu:structure:ZINC3': ok(whereUsedXml([])),
  'scope:structure:ZAPP': ok(SCOPE_XML),
  'wu:structure:ZAPP': ok(whereUsedXml([])),
  'scope:structure:ZS2': ok(SCOPE_XML),
  'wu:structure:ZS2': ok(whereUsedXml([])),
  'scope:structure:ZINC21': ok(SCOPE_XML),
  'wu:structure:ZINC21': ok(whereUsedXml([])),
  'scope:structure:ZINC22': ok(SCOPE_XML),
  'wu:structure:ZINC22': ok(whereUsedXml([])),

  // Enhancements: ZPROGE is a program (no class of that name) with two
  // includes; ZEI1's metadata names its program, ZEI2's is refused.
  'meta:prog:ZPROGE': ok(
    '<?xml version="1.0" encoding="utf-8"?><program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPROGE"/>',
  ),
  'elements:prog:ZPROGE': ok(elementsXml('ZENH_MAIN', 'WRITE / 1.')),
  'ns:PROG/P:ZPROGE:': ok(nodeXml([], [{ type: 'PROG/I', nodeId: '000007' }])),
  'ns:PROG/P:ZPROGE:7': ok(
    nodeXml([
      { type: 'PROG/I', name: 'ZEI1' },
      { type: 'PROG/I', name: 'ZEI2' },
    ]),
  ),
  'meta:incl:ZEI1': ok(includeMetaXml('ZEI1', 'ZPROGE')),
  'elements:incl:ZEI1': ok(elementsXml('ZENH_INCL', 'WRITE / 2.')),
  'meta:incl:ZEI2': { status: 403, statusText: 'Forbidden', body: '' },
  // A second program, read the same way.
  'meta:prog:ZPROGF': ok(
    '<?xml version="1.0" encoding="utf-8"?><program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPROGF"/>',
  ),
  'elements:prog:ZPROGF': ok(elementsXml('ZENH_F', 'WRITE / 3.')),
  'ns:PROG/P:ZPROGF:': ok(nodeXml([], [{ type: 'PROG/I', nodeId: '000007' }])),
  'ns:PROG/P:ZPROGF:7': ok(nodeXml([{ type: 'PROG/I', name: 'ZEF1' }])),
  'meta:incl:ZEF1': ok(includeMetaXml('ZEF1', 'ZPROGF')),
  'elements:incl:ZEF1': ok(elementsXml('ZENH_F1', 'WRITE / 4.')),
  'elements:class:ZCLE': ok(elementsXml('ZENH_CLASS', 'WRITE / 5.')),
  // A function group's main program: read as the group, without probing.
  'elements:fugr:ZFGE': ok(elementsXml('ZENH_GROUP', 'WRITE / 6.')),
};

const FAILED: PartAnswer = {
  status: 500,
  statusText: 'Internal Server Error',
  body: '',
};

/**
 * A system whose envelope number `failing` fails as a whole (`500`), the
 * others answered part by part from the model.
 */
function failingEnvelope(failing: number) {
  return system({}, (parts, index) => {
    if (index === failing) throw statusError(500, 'Internal Server Error');
    return envelopeResponse(
      parts.map((p) => answerOf({}, labelOf(p.method, p.url))),
    );
  });
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
  handler: (context: HandlerContext, args: any) => Promise<unknown>,
  args: Record<string, unknown>,
  labels: string[],
) {
  const fake = system({
    answers: Object.fromEntries(labels.map((label) => [label, FAILED])),
  });
  return withinTurns(handler(contextOn(fake, 'absent'), args), TURNS);
}

/** A chain of `n` includes, each naming the next: deeper than the walk goes. */
function chain(n: number): Record<string, PartAnswer> {
  const out: Record<string, PartAnswer> = {
    'src:prog:ZDEEP': ok('REPORT zdeep.\nINCLUDE zdeep_1.\n', text),
  };
  for (let i = 1; i <= n; i++) {
    out[`src:incl:ZDEEP_${i}`] = ok(`INCLUDE zdeep_${i + 1}.\n`, text);
  }
  return out;
}

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

/** The batched answer and the sequential one, of the same call on the same model. */
async function bothWays(
  handler: (context: HandlerContext, args: any) => Promise<unknown>,
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

/** The connection's refusal of the credential, before SAP was asked. */
const credential = () =>
  new AuthRefusedError(
    authError['credential-refused']({ credential: 'token' }),
    'request',
  );

const UNAUTHORIZED: PartAnswer = {
  status: 401,
  statusText: 'Unauthorized',
  body: '',
};

// ---------------------------------------------------------------------------
// GetIncludesList
// ---------------------------------------------------------------------------

describe('GetIncludesList', () => {
  it.each([
    [{ object_name: 'ZPROG', object_type: 'PROG/P' }],
    [{ object_name: 'ZINC_A', object_type: 'PROG/I' }],
    [{ object_name: 'ZFG', object_type: 'FUGR' }],
    [{ object_name: 'SAPLZFG', object_type: 'PROG/P' }],
    [
      {
        objects: [
          { object_name: 'ZPROG', object_type: 'PROG/P' },
          { object_name: 'ZFG', object_type: 'FUGR' },
          { object_name: 'ZCL', object_type: 'CLAS/OC' },
          { object_name: 'ZNONE', object_type: 'PROG/P' },
        ],
      },
    ],
  ])('same answer as the sequential version: %j', async (args) => {
    const { a, b, batched, sequential } = await bothWays(
      handleGetIncludesList,
      args,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(batched.directs).toHaveLength(0);
    expect(batched.envelopes.length).toBeGreaterThan(0);
    expect(sequential.envelopes).toHaveLength(0);
  });

  it('the tree is the depth-first walk: cycles and duplicates marked where the sequential walk marks them', async () => {
    const { a } = await bothWays(handleGetIncludesList, {
      object_name: 'ZPROG',
      object_type: 'PROG/P',
    });
    const tree = payloadOf(a).tree;
    expect(tree.children.map((c: { name: string }) => c.name)).toEqual([
      'ZINC_A',
      'ZINC_B',
    ]);
    const [incA, incB] = tree.children;
    expect(incA.children[0]).toMatchObject({ name: 'ZINC_C' });
    expect(incA.children[0].children[0]).toMatchObject({
      name: 'ZINC_A',
      cyclic: true,
    });
    expect(incA.children[1].children[0]).toMatchObject({ name: 'ZINC_D' });
    expect(incB).toMatchObject({ name: 'ZINC_B', duplicate: true });
  });

  it('a class is its one metadata read, sent as itself', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetIncludesList(contextOn(fake), {
        object_name: 'ZCL',
        object_type: 'CLAS/OC',
      }),
    );
    expect(fake.envelopes).toHaveLength(0);
    expect(directsOf(fake)).toEqual(['meta:class:ZCL']);
    expect(
      payloadOf(result).tree.children.map((c: { name: string }) => c.name),
    ).toEqual(['definitions', 'main']);
  });

  it('phases: the root source, then the includes of each depth, each read once', async () => {
    const fake = system();
    await withinTurns(
      handleGetIncludesList(contextOn(fake), {
        object_name: 'ZPROG',
        object_type: 'PROG/P',
      }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['src:prog:ZPROG'],
      ['src:incl:ZINC_A', 'src:incl:ZINC_B'],
      ['src:incl:ZINC_C', 'src:incl:ZINC_D'],
    ]);
  });

  it('phases of a function group: its node structure, its includes node, every include of the group', async () => {
    const fake = system();
    await withinTurns(
      handleGetIncludesList(contextOn(fake), {
        object_name: 'ZFG',
        object_type: 'FUGR',
      }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['ns:FUGR/F:ZFG:'],
      ['ns:FUGR/F:ZFG:5'],
      ['src:incl:LZFGTOP', 'src:incl:LZFGUXX', 'src:incl:LZFGU01'],
    ]);
  });

  it('several objects share the envelopes: their count does not grow with the number of objects', async () => {
    const one = system();
    await withinTurns(
      handleGetIncludesList(contextOn(one), {
        objects: [{ object_name: 'ZPROG', object_type: 'PROG/P' }],
      }),
      TURNS,
    );
    const two = system();
    const result = await withinTurns(
      handleGetIncludesList(contextOn(two), {
        objects: [
          { object_name: 'ZPROG', object_type: 'PROG/P' },
          { object_name: 'ZPROG2', object_type: 'PROG/P' },
        ],
      }),
      TURNS,
    );
    expect(two.envelopes).toHaveLength(one.envelopes.length);
    expect(phasesOf(two)[0]).toEqual(['src:prog:ZPROG', 'src:prog:ZPROG2']);
    expect(
      payloadOf(result).map((e: { object_name: string }) => e.object_name),
    ).toEqual(['ZPROG', 'ZPROG2']);
  });

  it('depth: up to 20 levels, one envelope each; the answer is the sequential version’s', async () => {
    const model = { answers: chain(25) };
    const { a, b, batched } = await bothWays(
      handleGetIncludesList,
      { object_name: 'ZDEEP', object_type: 'PROG/P' },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(batched.envelopes).toHaveLength(21);
    for (const phase of phasesOf(batched).slice(1)) {
      expect(phase).toHaveLength(1);
    }
  });

  it("a part's failure is that include's: unreadable, the rest answers, as the sequential version", async () => {
    const model = {
      answers: {
        'src:incl:ZINC_B': {
          status: 403,
          statusText: 'Forbidden',
          body: '',
        },
      },
    };
    const { a, b } = await bothWays(
      handleGetIncludesList,
      { object_name: 'ZPROG', object_type: 'PROG/P' },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a).unreadable).toEqual([
      expect.objectContaining({ name: 'ZINC_B', status: 403 }),
    ]);
  });

  it('a 401 SAP answered to an include ends the call as it came; no later level is read', async () => {
    const model = { answers: { 'src:incl:ZINC_A': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleGetIncludesList,
      { object_name: 'ZPROG', object_type: 'PROG/P' },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401, step: 'read source' });
    expect(batched.envelopes).toHaveLength(2);
  });

  it('a 401 in a list call ends the whole call, as in the sequential version', async () => {
    const model = { answers: { 'src:incl:ZINC2_A': UNAUTHORIZED } };
    const { a, b } = await bothWays(
      handleGetIncludesList,
      {
        objects: [
          { object_name: 'ZPROG', object_type: 'PROG/P' },
          { object_name: 'ZPROG2', object_type: 'PROG/P' },
        ],
      },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetIncludesList(contextOn(fake), {
        object_name: 'ZPROG',
        object_type: 'PROG/P',
      }),
    );
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(1);
  });

  it("an envelope that fails is every part's failure, the envelope's error as it came; nothing after it is read", async () => {
    const fake = system({}, (parts, index) => {
      if (index === 2) throw statusError(500, 'Internal Server Error');
      return envelopeResponse(
        parts.map((p) => answerOf({}, labelOf(p.method, p.url))),
      );
    });
    const result = await withinTurns(
      handleGetIncludesList(contextOn(fake), {
        object_name: 'ZPROG',
        object_type: 'PROG/P',
      }),
      TURNS,
    );
    const expected = await sequentialWithFailed(
      handleGetIncludesList,
      { object_name: 'ZPROG', object_type: 'PROG/P' },
      phasesOf(fake)[1] as string[],
    );
    expectEnvelopeFailure(result, expected, 2);
    expect(payloadOf(result).unreadable).toEqual([
      expect.objectContaining({
        name: 'ZINC_A',
        status: 500,
        step: 'read source',
      }),
      expect.objectContaining({
        name: 'ZINC_B',
        status: 500,
        step: 'read source',
      }),
    ]);
    expect(fake.envelopes).toHaveLength(2);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const fake = system({}, () => {
      throw statusError(404, 'Not Found');
    });
    const context = contextOn(fake);
    const result = await withinTurns(
      handleGetIncludesList(context, {
        object_name: 'ZPROG',
        object_type: 'PROG/P',
      }),
      TURNS,
    );
    const reference = system();
    const expected = await withinTurns(
      handleGetIncludesList(contextOn(reference, 'absent'), {
        object_name: 'ZPROG',
        object_type: 'PROG/P',
      }),
      TURNS,
    );
    expect(textOf(result)).toBe(textOf(expected));
    expect(fake.envelopes).toHaveLength(1);
    expect(context.batchAvailability?.available()).toBe(false);
  });

  it('exactly one of object_name/object_type or objects', async () => {
    const fake = system();
    const result = await handleGetIncludesList(contextOn(fake), {
      object_name: 'ZPROG',
      object_type: 'PROG/P',
      objects: [{ object_name: 'ZFG', object_type: 'FUGR' }],
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GetStructuresList
// ---------------------------------------------------------------------------

describe('GetStructuresList', () => {
  it.each([
    [{ structure_name: 'ZS', include_extensions: false }],
    [{ structure_name: 'ZS' }],
    [{ structure_name: 'ZINC2' }],
    [{ structure_name: 'ZMISSING' }],
    [{ structure_names: ['ZS', 'ZS2', 'ZMISSING'] }],
  ])('same answer as the sequential version: %j', async (args) => {
    const { a, b, batched, sequential } = await bothWays(
      handleGetStructuresList,
      args,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(batched.directs).toHaveLength(0);
    expect(sequential.envelopes).toHaveLength(0);
  });

  it('the tree: includes from the source, appends from where-used, a repeated structure marked cyclic', async () => {
    const { a } = await bothWays(handleGetStructuresList, {
      structure_name: 'ZS',
    });
    const tree = payloadOf(a).tree;
    expect(
      tree.children.map((c: { structure: string; kind: string }) => [
        c.structure,
        c.kind,
      ]),
    ).toEqual([
      ['ZINC1', 'include'],
      ['ZINC2', 'include'],
      ['ZAPP', 'append'],
    ]);
    expect(tree.children[0].children[0]).toMatchObject({ structure: 'ZINC3' });
    expect(tree.children[1].children[0]).toMatchObject({
      structure: 'ZINC3',
      cyclic: true,
    });
  });

  it('phases: per level the structure source of every node, then the table source of those it did not find', async () => {
    const fake = system();
    await withinTurns(
      handleGetStructuresList(contextOn(fake), {
        structure_name: 'ZS',
        include_extensions: false,
      }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['ddl:structure:ZS'],
      ['ddl:structure:ZINC1', 'ddl:structure:ZINC2'],
      ['ddl:table:ZINC2'],
      ['ddl:structure:ZINC3'],
    ]);
  });

  it('phases with extensions: per level the sources, the where-used scope pair, the scoped where-used, the candidates', async () => {
    const fake = system();
    await withinTurns(
      handleGetStructuresList(contextOn(fake), { structure_name: 'ZS' }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['ddl:structure:ZS'],
      ['scope:structure:ZS', 'scope:table:ZS'],
      ['wu:structure:ZS'],
      ['ddl:structure:ZAPP', 'ddl:structure:ZOTHER'],
      ['ddl:structure:ZINC1', 'ddl:structure:ZINC2'],
      ['ddl:table:ZINC2'],
      [
        'scope:structure:ZINC1',
        'scope:table:ZINC1',
        'scope:structure:ZINC2',
        'scope:table:ZINC2',
        'scope:structure:ZAPP',
        'scope:table:ZAPP',
      ],
      ['wu:structure:ZINC1', 'wu:table:ZINC2', 'wu:structure:ZAPP'],
      ['ddl:structure:ZINC3'],
      ['scope:structure:ZINC3', 'scope:table:ZINC3'],
      ['wu:structure:ZINC3'],
    ]);
  });

  it('a table read follows only a structure read that found nothing, in an envelope of its own', async () => {
    const fake = system();
    await withinTurns(
      handleGetStructuresList(contextOn(fake), {
        structure_names: ['ZS', 'ZS2'],
        include_extensions: false,
      }),
      TURNS,
    );
    const phases = phasesOf(fake);
    const notFound = new Set<string>();
    for (const phase of phases) {
      const kinds = new Set(phase.map((label) => label.split(':')[1]));
      expect(kinds.size).toBe(1);
      for (const label of phase) {
        const [, kind, name] = label.split(':');
        if (kind === 'table') expect(notFound.has(name as string)).toBe(true);
        if (kind === 'structure' && answerOf({}, label).status === 404) {
          notFound.add(name as string);
        }
      }
    }
  });

  it('several structures share the envelopes: their count does not grow with the number of structures', async () => {
    const one = system();
    await withinTurns(
      handleGetStructuresList(contextOn(one), {
        structure_names: ['ZS'],
        include_extensions: false,
      }),
      TURNS,
    );
    const two = system();
    const result = await withinTurns(
      handleGetStructuresList(contextOn(two), {
        structure_names: ['ZS', 'ZS2'],
        include_extensions: false,
      }),
      TURNS,
    );
    expect(two.envelopes).toHaveLength(one.envelopes.length);
    expect(phasesOf(two)[0]).toEqual(['ddl:structure:ZS', 'ddl:structure:ZS2']);
    expect(
      payloadOf(result).map(
        (e: { structure_name: string }) => e.structure_name,
      ),
    ).toEqual(['ZS', 'ZS2']);
  });

  it("a part's failure is that node's: its error, the rest answers, as the sequential version", async () => {
    const model = {
      answers: {
        'ddl:structure:ZINC1': {
          status: 500,
          statusText: 'Internal Server Error',
          body: '',
        },
        'ddl:table:ZINC1': {
          status: 500,
          statusText: 'Internal Server Error',
          body: '',
        },
      },
    };
    const { a, b } = await bothWays(
      handleGetStructuresList,
      { structure_name: 'ZS', include_extensions: false },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a).tree.children[0].error).toHaveLength(2);
  });

  it('a 401 SAP answered to a node ends the call as it came; no later phase is read', async () => {
    const model = { answers: { 'ddl:structure:ZINC1': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleGetStructuresList,
      { structure_name: 'ZS', include_extensions: false },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({
      status: 401,
      step: 'read structure',
    });
    expect(batched.envelopes).toHaveLength(2);
  });

  it('a 401 SAP answered to a where-used scope ends the call as it came', async () => {
    const model = { answers: { 'scope:structure:ZS': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleGetStructuresList,
      { structure_name: 'ZS' },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
    expect(batched.envelopes).toHaveLength(2);
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetStructuresList(contextOn(fake), { structure_name: 'ZS' }),
    );
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(1);
  });

  it("an envelope that fails is every part's failure; the answer is the sequential one with those reads failed", async () => {
    const args = { structure_name: 'ZS', include_extensions: false };
    const fake = failingEnvelope(2);
    const result = await withinTurns(
      handleGetStructuresList(contextOn(fake), args),
      TURNS,
    );
    const failed = phasesOf(fake)[1] as string[];
    expect(failed).toEqual(['ddl:structure:ZINC1', 'ddl:structure:ZINC2']);
    const expected = await sequentialWithFailed(
      handleGetStructuresList,
      args,
      failed,
    );
    expectEnvelopeFailure(result, expected, 1);
    expect(payloadOf(result).tree.children[0].error).toEqual([
      expect.objectContaining({ status: 500, step: 'read structure' }),
      expect.objectContaining({ step: 'read table' }),
    ]);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const fake = system({}, () => {
      throw statusError(404, 'Not Found');
    });
    const context = contextOn(fake);
    const result = await withinTurns(
      handleGetStructuresList(context, { structure_name: 'ZS' }),
      TURNS,
    );
    const reference = system();
    const expected = await withinTurns(
      handleGetStructuresList(contextOn(reference, 'absent'), {
        structure_name: 'ZS',
      }),
      TURNS,
    );
    expect(textOf(result)).toBe(textOf(expected));
    expect(context.batchAvailability?.available()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GetEnhancements
// ---------------------------------------------------------------------------

describe('GetEnhancements', () => {
  it.each([
    [{ object_name: 'ZPROGE', object_type: 'unknown', include_nested: true }],
    [
      {
        object_name: 'ZPROGE',
        object_type: 'unknown',
        include_nested: true,
        detailed: true,
      },
    ],
    [{ object_name: 'ZPROGE', object_type: 'PROG/P', include_nested: true }],
    [{ object_name: 'ZEI1', object_type: 'include' }],
    [{ object_name: 'ZEI2', object_type: 'include' }],
    [{ object_name: 'ZNONE', object_type: 'unknown' }],
    [
      {
        objects: [
          { object_name: 'ZPROGE', object_type: 'unknown' },
          { object_name: 'ZCLE', object_type: 'CLAS/OC' },
          { object_name: 'ZNONE', object_type: 'unknown' },
        ],
        include_nested: true,
      },
    ],
  ])('same answer as the sequential version: %j', async (args) => {
    const { a, b, batched, sequential } = await bothWays(
      handleGetEnhancements,
      args,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(batched.directs).toHaveLength(0);
    expect(sequential.envelopes).toHaveLength(0);
  });

  it('phases: the probes one per phase, the enhancements with the root node structure, the includes node, the includes’ metadata, their enhancements', async () => {
    const fake = system();
    const result = await withinTurns(
      handleGetEnhancements(contextOn(fake), {
        object_name: 'ZPROGE',
        object_type: 'unknown',
        include_nested: true,
      }),
      TURNS,
    );
    expect(phasesOf(fake)).toEqual([
      ['meta:class:ZPROGE'],
      ['meta:prog:ZPROGE'],
      ['elements:prog:ZPROGE', 'ns:PROG/P:ZPROGE:'],
      ['ns:PROG/P:ZPROGE:7'],
      ['meta:incl:ZEI1', 'meta:incl:ZEI2'],
      ['elements:incl:ZEI1'],
    ]);
    const body = payloadOf(result);
    expect(body.total_objects_analyzed).toBe(2);
    expect(body.includes_unread).toEqual([
      expect.objectContaining({ include: 'ZEI2', step: 'read enhancements' }),
    ]);
  });

  it('an object named by its type, without include_nested, is its one request, sent as itself', async () => {
    const fake = system();
    await withinTurns(
      handleGetEnhancements(contextOn(fake), {
        object_name: 'ZCLE',
        object_type: 'CLAS/OC',
      }),
    );
    expect(fake.envelopes).toHaveLength(0);
    expect(directsOf(fake)).toEqual(['elements:class:ZCLE']);
  });

  it('several objects share the envelopes: their count does not grow with the number of objects', async () => {
    const one = system();
    await withinTurns(
      handleGetEnhancements(contextOn(one), {
        objects: [{ object_name: 'ZPROGE', object_type: 'unknown' }],
        include_nested: true,
      }),
      TURNS,
    );
    const two = system();
    const result = await withinTurns(
      handleGetEnhancements(contextOn(two), {
        objects: [
          { object_name: 'ZPROGE', object_type: 'unknown' },
          { object_name: 'ZPROGF', object_type: 'unknown' },
        ],
        include_nested: true,
      }),
      TURNS,
    );
    expect(two.envelopes).toHaveLength(one.envelopes.length);
    expect(phasesOf(two)[0]).toEqual([
      'meta:class:ZPROGE',
      'meta:class:ZPROGF',
    ]);
    expect(
      payloadOf(result).map(
        (e: { main_object: { name: string } }) => e.main_object.name,
      ),
    ).toEqual(['ZPROGE', 'ZPROGF']);
  });

  it("a part's failure is that object's: the rest answers, as the sequential version", async () => {
    const model = {
      answers: {
        'elements:prog:ZPROGF': {
          status: 403,
          statusText: 'Forbidden',
          body: '',
        },
      },
    };
    const { a, b } = await bothWays(
      handleGetEnhancements,
      {
        objects: [
          { object_name: 'ZPROGE', object_type: 'PROG/P' },
          { object_name: 'ZPROGF', object_type: 'PROG/P' },
        ],
      },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    const [first, second] = payloadOf(a);
    expect(first.enhancements).toHaveLength(1);
    expect(second).toMatchObject({
      object_name: 'ZPROGF',
      error: expect.objectContaining({ status: 403 }),
    });
  });

  it('a 401 SAP answered to a probe ends the call as it came; no later phase is read', async () => {
    const model = { answers: { 'meta:class:ZPROGE': UNAUTHORIZED } };
    const { a, b, batched } = await bothWays(
      handleGetEnhancements,
      { object_name: 'ZPROGE', object_type: 'unknown', include_nested: true },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({
      status: 401,
      step: 'read class metadata',
    });
    expect(batched.envelopes).toHaveLength(1);
  });

  it("a 401 SAP answered to an include's enhancements ends the call as it came", async () => {
    const model = { answers: { 'elements:incl:ZEI1': UNAUTHORIZED } };
    const { a, b } = await bothWays(
      handleGetEnhancements,
      { object_name: 'ZPROGE', object_type: 'PROG/P', include_nested: true },
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(payloadOf(a)).toMatchObject({ status: 401 });
  });

  it("the connection's credential refusal ends the call as it came", async () => {
    const fake = system({}, () => {
      throw credential();
    });
    const result = await withinTurns(
      handleGetEnhancements(contextOn(fake), {
        object_name: 'ZPROGE',
        object_type: 'unknown',
      }),
    );
    expect(payloadOf(result).error).toBe('authentication_failed');
    expect(fake.envelopes).toHaveLength(1);
  });

  it('max_includes: only the first includes are read, as the sequential version reads them', async () => {
    const args = {
      object_name: 'ZPROGE',
      object_type: 'PROG/P',
      include_nested: true,
      max_includes: 1,
    };
    const { a, b, batched } = await bothWays(handleGetEnhancements, args);
    expect(textOf(a)).toBe(textOf(b));
    expect(phasesOf(batched)).toEqual([
      ['elements:prog:ZPROGE', 'ns:PROG/P:ZPROGE:'],
      ['ns:PROG/P:ZPROGE:7'],
      ['meta:incl:ZEI1'],
      ['elements:incl:ZEI1'],
    ]);
    expect(payloadOf(a).total_objects_analyzed).toBe(2);
  });

  it('a refused class probe, then the program found: the refusal beside the enhancements, as the sequential version', async () => {
    const model = {
      answers: {
        'meta:class:ZPROGE': { status: 403, statusText: 'Forbidden', body: '' },
      },
    };
    const args = { object_name: 'ZPROGE', object_type: 'unknown' };
    const { a, b, batched } = await bothWays(
      handleGetEnhancements,
      args,
      model,
    );
    expect(textOf(a)).toBe(textOf(b));
    expect(phasesOf(batched)).toEqual([
      ['meta:class:ZPROGE'],
      ['meta:prog:ZPROGE'],
      ['elements:prog:ZPROGE'],
    ]);
    const body = payloadOf(a);
    expect(body.object_type).toBe('program');
    expect(body.unreadable).toEqual([
      expect.objectContaining({ status: 403, step: 'read class metadata' }),
    ]);
  });

  it.each([
    [{ object_name: 'SAPLZFGE', object_type: 'unknown' }],
    [{ object_name: 'SAPLZFGE', include_nested: true }],
  ])(
    'an untyped SAPL<fg> is read as its group, without probing: %j',
    async (args) => {
      const { a, b, batched } = await bothWays(handleGetEnhancements, args);
      expect(textOf(a)).toBe(textOf(b));
      expect(phasesOf(batched)[0]).toContain('elements:fugr:ZFGE');
      expect(
        phasesOf(batched)
          .flat()
          .some((label) => label.startsWith('meta:')),
      ).toBe(false);
      expect(payloadOf(a).enhancements ?? payloadOf(a).objects).toBeDefined();
    },
  );

  it("an envelope that fails is every part's failure; the answer is the sequential one with those reads failed", async () => {
    const args = {
      object_name: 'ZPROGE',
      object_type: 'PROG/P',
      include_nested: true,
    };
    const fake = failingEnvelope(1);
    const result = await withinTurns(
      handleGetEnhancements(contextOn(fake), args),
      TURNS,
    );
    const failed = phasesOf(fake)[0] as string[];
    expect(failed).toEqual(['elements:prog:ZPROGE', 'ns:PROG/P:ZPROGE:']);
    expect(fake.envelopes).toHaveLength(1);
    const expected = await sequentialWithFailed(
      handleGetEnhancements,
      args,
      failed,
    );
    expectEnvelopeFailure(result, expected, 1);
    expect(payloadOf(result)).toMatchObject({
      status: 500,
      step: 'read enhancements',
    });
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const fake = system({}, () => {
      throw statusError(404, 'Not Found');
    });
    const context = contextOn(fake);
    const args = {
      object_name: 'ZPROGE',
      object_type: 'unknown',
      include_nested: true,
    };
    const result = await withinTurns(
      handleGetEnhancements(context, args),
      TURNS,
    );
    const reference = system();
    const expected = await withinTurns(
      handleGetEnhancements(contextOn(reference, 'absent'), args),
      TURNS,
    );
    expect(textOf(result)).toBe(textOf(expected));
    expect(context.batchAvailability?.available()).toBe(false);
  });
});
