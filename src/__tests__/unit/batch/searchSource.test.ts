/**
 * `SearchSource` on internal batches (spec §11, row `SearchSource`): (1) the
 * quickSearch of every package mask in one envelope; (2) the package walk's
 * levels, as `walkPackage` (per level the root node structures, then their
 * type nodes); (3) the source reads of the scan targets, up to
 * `max_objects` — the main sources and function group structures together,
 * then every function group's includes and function modules together;
 * `time_budget_ms` checked between phases. The hits are the sequential
 * version's (today's code), a part's failure is that object's, a credential
 * refusal ends the call as it came, and a destination with no communication
 * batch runs the sequential reads.
 *
 * Real handler, real clients, real `AdtBatchConnection`; only the connection
 * is a fake, answering from a small repository model.
 */
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  handleSearchSource,
  TOOL_DEFINITION,
} from '../../../handlers/system/readonly/handleSearchSource';
import { createBatchAvailability } from '../../../lib/batch/availability';
import {
  envelopeConnection,
  envelopeResponse as envelopeOf,
  type InnerRequest,
  type PartAnswer,
  type SeenEnvelope,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

// ---------------------------------------------------------------------------
// The repository model
// ---------------------------------------------------------------------------

interface Obj {
  type: string;
  name: string;
}

interface NodeDoc {
  objects?: Obj[];
  types?: Array<{ type: string; nodeId: string }>;
}

const xmlNode = (doc: NodeDoc): string => {
  const objects = (doc.objects ?? [])
    .map(
      (o) =>
        `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${o.type}</OBJECT_TYPE><OBJECT_NAME>${o.name}</OBJECT_NAME><TECH_NAME>${o.name}</TECH_NAME><OBJECT_URI>/sap/bc/adt/x/${o.name.toLowerCase()}</OBJECT_URI></SEU_ADT_REPOSITORY_OBJ_NODE>`,
    )
    .join('');
  const types = (doc.types ?? [])
    .map(
      (t) =>
        `<SEU_ADT_OBJECT_TYPE_INFO><OBJECT_TYPE>${t.type}</OBJECT_TYPE><NODE_ID>${t.nodeId}</NODE_ID></SEU_ADT_OBJECT_TYPE_INFO>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>${objects}</TREE_CONTENT><OBJECT_TYPES>${types}</OBJECT_TYPES></DATA></asx:values></asx:abap>`;
};

const nodeKey = (name: string, nodeId?: string | null) => {
  const id = nodeId ?? '';
  return `NODE ${name}${id === '' || Number(id) === 0 ? '' : `#${Number(id)}`}`;
};

/**
 * `ZR*` finds `ZROOT`, which holds two programs, a function group and the
 * subpackage `ZSUB` (one class); `ZOTHER`, asked by its exact name, holds one
 * program.
 */
const NODES: Record<string, NodeDoc> = {
  [nodeKey('ZROOT')]: {
    types: [
      { type: 'DEVC/K', nodeId: '000010' },
      { type: 'PROG/P', nodeId: '000020' },
      { type: 'FUGR/F', nodeId: '000030' },
    ],
  },
  [nodeKey('ZROOT', '10')]: { objects: [{ type: 'DEVC/K', name: 'ZSUB' }] },
  [nodeKey('ZROOT', '20')]: {
    objects: [
      { type: 'PROG/P', name: 'ZPROG_A' },
      { type: 'PROG/P', name: 'ZPROG_B' },
    ],
  },
  [nodeKey('ZROOT', '30')]: { objects: [{ type: 'FUGR/F', name: 'ZFG_A' }] },
  [nodeKey('ZSUB')]: { types: [{ type: 'CLAS/OC', nodeId: '000040' }] },
  [nodeKey('ZSUB', '40')]: { objects: [{ type: 'CLAS/OC', name: 'ZCL_A' }] },
  [nodeKey('ZOTHER')]: { types: [{ type: 'PROG/P', nodeId: '000020' }] },
  [nodeKey('ZOTHER', '20')]: {
    objects: [{ type: 'PROG/P', name: 'ZPROG_O' }],
  },
};

const SOURCES: Record<string, string> = {
  'PROGRAM ZPROG_A': "REPORT zprog_a.\n* marker in a comment\nWRITE 'marker'.",
  'PROGRAM ZPROG_B': 'REPORT zprog_b.',
  'PROGRAM ZPROG_O': "REPORT zprog_o.\nWRITE 'marker'.",
  'CLASS ZCL_A': 'CLASS zcl_a DEFINITION.\n" marker\nENDCLASS.',
  'INCLUDE LZFG_ATOP': 'FUNCTION-POOL zfg_a.\nDATA marker TYPE i.',
  'INCLUDE LZFG_AUXX': 'INCLUDE lzfg_au01.',
  'FM Z_FM_A': 'FUNCTION z_fm_a.\n  marker = 1.\nENDFUNCTION.',
};

const FUGR_CHILDREN: Record<string, Array<[string, string]>> = {
  ZFG_A: [
    ['FUGR/I', 'LZFG_AUXX'],
    ['FUGR/FF', 'VIEWFRAME_ZFG'],
    ['FUGR/I', 'LZFG_ATOP'],
    ['FUGR/FF', 'Z_FM_A'],
  ],
};

const STRUCTURE_XML = (name: string) =>
  `<?xml version="1.0" encoding="utf-8"?><projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">${(
    FUGR_CHILDREN[name] ?? []
  )
    .map(
      ([type, child]) =>
        `<projectexplorer:node objecttype="${type}" objectname="${child}"/>`,
    )
    .join('')}</projectexplorer:objectstructure>`;

const SEARCH_XML = (names: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${names
    .map(
      (name) =>
        `<adtcore:objectReference adtcore:uri="/sap/bc/adt/packages/${name.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${name}" adtcore:packageName="${name}"/>`,
    )
    .join('')}</adtcore:objectReferences>`;

const MASKS: Record<string, string[]> = { 'ZR*': ['ZROOT'] };

const segmentAfter = (path: string, marker: string): string => {
  const at = path.indexOf(marker);
  if (at < 0) return '';
  const rest = path.slice(at + marker.length);
  const end = rest.indexOf('/');
  return decodeURIComponent(end < 0 ? rest : rest.slice(0, end)).toUpperCase();
};

/** The key of any request the scan makes. */
function keyOf(url: string, params?: unknown): string {
  const parsed = new URL(url, 'https://system.invalid');
  const query = new URLSearchParams(parsed.search);
  for (const [k, v] of Object.entries(
    (params ?? {}) as Record<string, unknown>,
  )) {
    query.set(k, String(v));
  }
  const path = parsed.pathname;
  if (path.endsWith('/repository/nodestructure')) {
    return nodeKey(query.get('parent_name') ?? '', query.get('node_id'));
  }
  if (path.endsWith('/informationsystem/search')) {
    return `SEARCH ${query.get('query')}`;
  }
  if (path.endsWith('/repository/objectstructure')) {
    return `STRUCTURE ${(query.get('objectname') ?? '').toUpperCase()}`;
  }
  if (path.includes('/fmodules/')) {
    return `FM ${segmentAfter(path, '/fmodules/')}`;
  }
  if (path.includes('/programs/includes/')) {
    return `INCLUDE ${segmentAfter(path, '/programs/includes/')}`;
  }
  if (path.includes('/programs/programs/')) {
    return `PROGRAM ${segmentAfter(path, '/programs/programs/')}`;
  }
  if (path.includes('/oo/classes/')) {
    return `CLASS ${segmentAfter(path, '/oo/classes/')}`;
  }
  return `OTHER ${path}`;
}

interface Model {
  /** Requests answered with this status instead (a key of `keyOf`). */
  refuse?: Record<string, number>;
}

function answerOf(model: Model, url: string, params?: unknown): PartAnswer {
  const key = keyOf(url, params);
  const refused = model.refuse?.[key];
  if (refused !== undefined) {
    return { status: refused, statusText: 'Refused', body: '' };
  }
  const xml = { 'content-type': 'application/xml' };
  const text = { 'content-type': 'text/plain' };
  if (key.startsWith('SEARCH ')) {
    const mask = key.slice('SEARCH '.length);
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: SEARCH_XML(MASKS[mask] ?? []),
    };
  }
  if (key.startsWith('STRUCTURE ')) {
    return {
      status: 200,
      statusText: 'OK',
      headers: xml,
      body: STRUCTURE_XML(key.slice('STRUCTURE '.length)),
    };
  }
  const doc = NODES[key];
  if (doc !== undefined) {
    return { status: 200, statusText: 'OK', headers: xml, body: xmlNode(doc) };
  }
  const source = SOURCES[key];
  if (source !== undefined) {
    return { status: 200, statusText: 'OK', headers: text, body: source };
  }
  return { status: 404, statusText: 'Not Found', body: '' };
}

/**
 * The system: envelopes answered part by part, direct requests one by one;
 * `envelope` / `direct` replace either answer; `afterEnvelope` runs once each
 * envelope is answered (the clock moves there).
 */
function system(
  model: Model = {},
  options: {
    envelope?: (parts: InnerRequest[]) => never;
    direct?: () => never;
    afterEnvelope?: (count: number) => void;
  } = {},
) {
  let count = 0;
  return envelopeConnection(
    (parts: InnerRequest[]) => {
      if (options.envelope !== undefined) options.envelope(parts);
      const answered = envelopeOf(parts.map((p) => answerOf(model, p.url)));
      count += 1;
      options.afterEnvelope?.(count);
      return answered;
    },
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      if (options.direct !== undefined) options.direct();
      const a = answerOf(model, request.url, request.params);
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
const isError = (result: unknown) =>
  (result as { isError?: boolean }).isError === true;

const partKeys = (envelope: SeenEnvelope) =>
  envelope.parts.map((p) => keyOf(p.url));

/** The connection's refusal of the credential, before SAP was asked. */
const credential = () =>
  new AuthRefusedError(
    authError['credential-refused']({ credential: 'token' }),
    'request',
  );

const ASKED = {
  query: 'marker',
  packages: ['ZR*', 'ZOTHER'],
};

const search = (
  fake: Fake,
  args: Record<string, unknown> = {},
  absent = false,
) =>
  withinTurns(
    handleSearchSource(contextOn(fake, absent ? 'absent' : 'served'), {
      ...ASKED,
      ...args,
    } as never),
    400,
  );

const hitNames = (result: unknown) =>
  payloadOf(result).results.map(
    (h: { object_name: string; include: string }) =>
      `${h.object_name}/${h.include}`,
  );

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

describe('SearchSource on internal batches', () => {
  it('same hits as the sequential version', async () => {
    const batched = system();
    const sequential = system();
    const a = await search(batched, { emit_no_hits: true });
    const b = await search(sequential, { emit_no_hits: true }, true);
    expect(isError(a)).toBe(false);
    expect(textOf(a)).toBe(textOf(b));
    expect(hitNames(a)).toEqual([
      'ZPROG_O/ZPROG_O',
      'ZFG_A/LZFG_ATOP',
      'ZFG_A/Z_FM_A',
      'ZPROG_A/ZPROG_A',
      'ZPROG_A/ZPROG_A',
      'ZCL_A/ZCL_A',
    ]);
    expect(payloadOf(a).no_hits).toEqual([
      { devclass: 'ZROOT', object_type: 'PROG', object_name: 'ZPROG_B' },
    ]);
    expect(batched.directs).toHaveLength(0);
    expect(sequential.envelopes).toHaveLength(0);
    // Comments dropped: the same both ways too.
    const c = await search(system(), { exclude_comments: true });
    const d = await search(system(), { exclude_comments: true }, true);
    expect(textOf(c)).toBe(textOf(d));
  });

  it('phases: masks, walk levels, sources up to max_objects', async () => {
    const fake = system();
    await search(fake);
    expect(fake.envelopes.map(partKeys)).toEqual([
      // (1) the quickSearch of every mask
      ['SEARCH ZR*'],
      // (2) the walk: level 1 roots (exact names first, then the masks'
      // packages), their type nodes; level 2 likewise
      [nodeKey('ZOTHER'), nodeKey('ZROOT')],
      [
        nodeKey('ZOTHER', '20'),
        nodeKey('ZROOT', '10'),
        nodeKey('ZROOT', '20'),
        nodeKey('ZROOT', '30'),
      ],
      [nodeKey('ZSUB')],
      [nodeKey('ZSUB', '40')],
      // (3) the main sources and the function group structure of every
      // target, then the function group's sources
      [
        'PROGRAM ZPROG_O',
        'STRUCTURE ZFG_A',
        'PROGRAM ZPROG_A',
        'PROGRAM ZPROG_B',
        'CLASS ZCL_A',
      ],
      ['FM Z_FM_A', 'INCLUDE LZFG_ATOP', 'INCLUDE LZFG_AUXX'],
    ]);

    // max_objects caps the targets before their phase is recorded.
    const capped = system();
    const result = await search(capped, { max_objects: 2 });
    expect(capped.envelopes.slice(5).map(partKeys)).toEqual([
      ['PROGRAM ZPROG_O', 'STRUCTURE ZFG_A'],
      ['FM Z_FM_A', 'INCLUDE LZFG_ATOP', 'INCLUDE LZFG_AUXX'],
    ]);
    expect(payloadOf(result).truncated.by_max_objects).toBe(true);
    expect(payloadOf(result).scanned.objects).toBe(2);
    const sequential = await search(system(), { max_objects: 2 }, true);
    expect(textOf(result)).toBe(textOf(sequential));
  });

  describe('the cursor: start_at in, next_start_at out', () => {
    // The five targets, in (package, type, name) order: ZPROG_O, ZFG_A,
    // ZPROG_A, ZPROG_B, ZCL_A.
    const scanned = (result: unknown) =>
      [...payloadOf(result).results, ...(payloadOf(result).no_hits ?? [])]
        .map((h: { object_name: string }) => h.object_name)
        .sort();

    it('orders the targets by (package, type, name): the sources are read in that order', async () => {
      const fake = system();
      await search(fake);
      expect(partKeys(fake.envelopes[5])).toEqual([
        'PROGRAM ZPROG_O',
        'STRUCTURE ZFG_A',
        'PROGRAM ZPROG_A',
        'PROGRAM ZPROG_B',
        'CLASS ZCL_A',
      ]);
    });

    it('start_at 0, max_objects 2: next_start_at 2, as the sequential version', async () => {
      const result = await search(system(), {
        start_at: 0,
        max_objects: 2,
      });
      const p = payloadOf(result);
      expect(p.scanned.objects).toBe(2);
      expect(p.next_start_at).toBe(2);
      expect(p.total_targets).toBe(5);
      expect(p.truncated.by_max_objects).toBe(true);
      const sequential = await search(
        system(),
        { start_at: 0, max_objects: 2 },
        true,
      );
      expect(textOf(result)).toBe(textOf(sequential));
    });

    it('start_at 4 reads the last target only; no next_start_at', async () => {
      const fake = system();
      const result = await search(fake, { start_at: 4, max_objects: 2 });
      const p = payloadOf(result);
      expect(scanned(result)).toEqual(['ZCL_A']);
      expect('next_start_at' in p).toBe(false);
      expect(p.total_targets).toBe(5);
      expect(p.truncated.by_max_objects).toBe(false);
      expect(fake.envelopes.slice(5).map(partKeys)).toEqual([['CLASS ZCL_A']]);
      const sequential = await search(
        system(),
        { start_at: 4, max_objects: 2 },
        true,
      );
      expect(textOf(result)).toBe(textOf(sequential));
    });

    it.each([5, 9])(
      'start_at %i: no hits, no cursor, total_targets 5; no source read',
      async (at) => {
        const fake = system();
        const result = await search(fake, { start_at: at, max_objects: 2 });
        const p = payloadOf(result);
        expect(p.results).toEqual([]);
        expect('next_start_at' in p).toBe(false);
        expect(p.total_targets).toBe(5);
        expect(fake.envelopes).toHaveLength(5);
        const sequential = await search(
          system(),
          { start_at: at, max_objects: 2 },
          true,
        );
        expect(textOf(result)).toBe(textOf(sequential));
      },
    );

    it('three calls (0, 2, 4) hold the hits of one call over all five', async () => {
      const whole = await search(system(), {
        max_objects: 5,
        emit_no_hits: true,
      });
      const parts: unknown[] = [];
      for (const at of [0, 2, 4]) {
        parts.push(
          await search(system(), {
            start_at: at,
            max_objects: 2,
            emit_no_hits: true,
          }),
        );
      }
      expect(parts.map((r) => payloadOf(r).next_start_at)).toEqual([
        2,
        4,
        undefined,
      ]);
      expect(parts.flatMap((r) => hitNames(r)).sort()).toEqual(
        hitNames(whole).sort(),
      );
      expect(parts.flatMap((r) => scanned(r)).sort()).toEqual(scanned(whole));
    });
  });

  describe('time_budget_ms checked between phases, truncated.by_timeout as today', () => {
    let clock = 0;
    let spy: jest.SpyInstance<number, []>;
    beforeEach(() => {
      clock = 1_000_000;
      spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });
    afterEach(() => spy.mockRestore());

    it('a deadline passed during the walk: no source is read', async () => {
      const fake = system(
        {},
        {
          afterEnvelope: (n) => {
            if (n === 3) clock += 10_000;
          },
        },
      );
      const result = await search(fake, { time_budget_ms: 5_000 });
      // The walk's level 2 and the sources were never sent.
      expect(fake.envelopes).toHaveLength(3);
      const payload = payloadOf(result);
      expect(payload.results).toEqual([]);
      expect(payload.truncated.by_timeout).toBe(true);
      expect(payload.scanned.sources).toBe(0);
    });

    it('a deadline passed before the sources: none is read, the targets are counted', async () => {
      const fake = system(
        {},
        {
          afterEnvelope: (n) => {
            if (n === 5) clock += 10_000;
          },
        },
      );
      const result = await search(fake, { time_budget_ms: 5_000 });
      expect(fake.envelopes).toHaveLength(5);
      const payload = payloadOf(result);
      expect(payload.results).toEqual([]);
      expect(payload.truncated).toEqual({
        by_object_cap: false,
        by_max_objects: false,
        by_timeout: true,
      });
      expect(payload.scanned).toEqual({ packages: 2, objects: 5, sources: 0 });
    });

    it('a deadline passed between the source phases: what was read is scanned', async () => {
      const fake = system(
        {},
        {
          afterEnvelope: (n) => {
            if (n === 6) clock += 10_000;
          },
        },
      );
      const result = await search(fake, { time_budget_ms: 5_000 });
      expect(fake.envelopes).toHaveLength(6);
      expect(hitNames(result)).toEqual([
        'ZPROG_O/ZPROG_O',
        'ZPROG_A/ZPROG_A',
        'ZPROG_A/ZPROG_A',
        'ZCL_A/ZCL_A',
      ]);
      expect(payloadOf(result).truncated.by_timeout).toBe(true);
      expect(payloadOf(result).scanned.sources).toBe(4);
    });

    it('a budget that holds: every phase runs, by_timeout false', async () => {
      const fake = system();
      const result = await search(fake, { time_budget_ms: 5_000 });
      expect(fake.envelopes).toHaveLength(7);
      expect(payloadOf(result).truncated.by_timeout).toBe(false);
    });
  });

  it('no concurrency in the schema', () => {
    expect(Object.keys(TOOL_DEFINITION.inputSchema)).not.toContain(
      'concurrency',
    );
    expect(TOOL_DEFINITION.description).not.toContain('concurrency');
  });

  it("a part failure is that object's; the others answer", async () => {
    const model = { refuse: { 'PROGRAM ZPROG_A': 500 } };
    const fake = system(model);
    const result = await search(fake);
    expect(isError(result)).toBe(false);
    const payload = payloadOf(result);
    expect(payload.failures).toEqual([
      expect.objectContaining({
        devclass: 'ZROOT',
        object_type: 'PROG',
        object_name: 'ZPROG_A',
        error: expect.objectContaining({ status: 500 }),
      }),
    ]);
    expect(hitNames(result)).toEqual([
      'ZPROG_O/ZPROG_O',
      'ZFG_A/LZFG_ATOP',
      'ZFG_A/Z_FM_A',
      'ZCL_A/ZCL_A',
    ]);
    const sequential = await search(system(model), {}, true);
    expect(textOf(result)).toBe(textOf(sequential));
  });

  it('a source that is not there is skipped, as on the sequential path', async () => {
    const model = { refuse: { 'INCLUDE LZFG_ATOP': 404 } };
    const result = await search(system(model));
    expect(payloadOf(result).failures).toBeUndefined();
    expect(hitNames(result)).not.toContain('ZFG_A/LZFG_ATOP');
    const sequential = await search(system(model), {}, true);
    expect(textOf(result)).toBe(textOf(sequential));
  });

  it('a credential refusal ends the call as it came', async () => {
    const fake = system(
      {},
      {
        envelope: () => {
          throw credential();
        },
      },
    );
    const result = await search(fake);
    expect(isError(result)).toBe(true);
    expect(fake.envelopes).toHaveLength(1);
    const sequential = system(
      {},
      {
        direct: () => {
          throw credential();
        },
      },
    );
    const answered = await search(sequential, {}, true);
    expect(textOf(result)).toBe(textOf(answered));
  });

  it('a 401 SAP answered for one source ends the call; nothing after it is read', async () => {
    const model = { refuse: { 'PROGRAM ZPROG_A': 401 } };
    const fake = system(model);
    const result = await search(fake);
    expect(isError(result)).toBe(true);
    // The function group's sources were never asked.
    expect(fake.envelopes).toHaveLength(6);
    const sequential = await search(system(model), {}, true);
    expect(textOf(result)).toBe(textOf(sequential));
  });

  it('no communication batch: the sequential path', async () => {
    const fake = system();
    const result = await search(fake, {}, true);
    expect(fake.envelopes).toHaveLength(0);
    expect(fake.directs.length).toBeGreaterThan(0);
    expect(hitNames(result)).toHaveLength(6);
  });

  it('an outer 404 to the first envelope: the sequential path runs', async () => {
    const fake = system(
      {},
      {
        envelope: () => {
          throw statusError(404, 'Not Found');
        },
      },
    );
    const result = await search(fake);
    expect(fake.envelopes).toHaveLength(1);
    expect(fake.directs.length).toBeGreaterThan(0);
    expect(textOf(result)).toBe(textOf(await search(system(), {}, true)));
  });
});
