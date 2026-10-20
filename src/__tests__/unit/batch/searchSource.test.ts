/**
 * `SearchSource` on internal batches (spec §11, row `SearchSource`): (1) the
 * quickSearch of every package mask in one envelope; (2) the package walk's
 * levels, as `walkPackage` (per level the root node structures, then their
 * type nodes); (3) the source reads of the scan targets, up to
 * `max_objects` — the main sources and function group structures together,
 * then every function group's includes and function modules together
 * (in envelopes of at most 300 reads: `searchSourceEnvelopes.test.ts`);
 * `time_budget_ms` checked before every envelope. The hits are the sequential
 * version's (today's code), a part's failure is that object's, a credential
 * refusal ends the call as it came, and a destination with no communication
 * batch runs the sequential reads.
 *
 * Real handler, real clients, real `AdtBatchConnection`; only the connection
 * is a fake, answering from a small repository model.
 */
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { TOOL_DEFINITION } from '../../../handlers/system/readonly/handleSearchSource';
import { statusError } from '../../helpers/batchEnvelope';
import {
  type Fake,
  hitNames,
  isError,
  type Model,
  type NodeDoc,
  nodeKey,
  partKeys,
  payloadOf,
  type Repository,
  type SystemOptions,
  searchOn,
  standOn,
  textOf,
} from '../../helpers/searchSourceStand';

// ---------------------------------------------------------------------------
// The repository model
// ---------------------------------------------------------------------------

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

const MASKS: Record<string, string[]> = { 'ZR*': ['ZROOT'] };

const REPOSITORY: Repository = {
  nodes: NODES,
  sources: SOURCES,
  fugrChildren: FUGR_CHILDREN,
  masks: MASKS,
};

const system = (model: Model = {}, options: SystemOptions = {}) =>
  standOn(REPOSITORY, model, options);

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
) => searchOn(fake, { ...ASKED, ...args }, absent);

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

  describe('time_budget_ms checked before every envelope; the answer holds whole targets', () => {
    let clock = 0;
    let spy: jest.SpyInstance<number, []>;
    beforeEach(() => {
      clock = 1_000_000;
      spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });
    afterEach(() => spy.mockRestore());

    it('a deadline passed during the walk: no source is read; next_start_at = start_at, total_targets unknown', async () => {
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
      // The targets were never enumerated: their count is left out, and the
      // call goes on from where it was asked to start.
      expect('total_targets' in payload).toBe(false);
      expect(payload.next_start_at).toBe(0);
    });

    it('a deadline passed before the sources: none is read; next_start_at = start_at', async () => {
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
      expect(payload.scanned).toEqual({ packages: 2, objects: 0, sources: 0 });
      expect(payload.total_targets).toBe(5);
      // Nothing of the slice was read: the call goes on from its start.
      expect(payload.next_start_at).toBe(0);
    });

    it('a deadline passed between the source phases: the chunk is cut, none of its targets is answered', async () => {
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
      // The programs and the class were read whole, but the function group
      // was not: the five targets are one chunk, and a cut chunk answers
      // none of them — the next call reads them from next_start_at.
      expect(hitNames(result)).toEqual([]);
      expect(payloadOf(result).truncated.by_timeout).toBe(true);
      expect(payloadOf(result).scanned.sources).toBe(0);
      expect(payloadOf(result).next_start_at).toBe(0);
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
