/**
 * `SearchSource` on internal batches (spec §11, row `SearchSource`): (1) the
 * quickSearch of every package mask in one envelope; (2) the package walk's
 * levels, as `walkPackage` (per level the root node structures, then their
 * type nodes); (3) the source reads of every scan target — the main sources and function group structures together,
 * then every function group's includes and function modules together
 * (in envelopes of at most 300 reads: `searchSourceEnvelopes.test.ts`).
 * The hits are the sequential
 * version's (today's code), a part that cannot be read is skipped, a credential
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

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

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
  'FM VIEWFRAME_ZFG': 'FUNCTION viewframe_zfg.\nENDFUNCTION.',
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
    const a = await search(batched);
    const b = await search(sequential, {}, true);
    expect(isError(a)).toBe(false);
    expect(textOf(a)).toBe(textOf(b));
    expect(hitNames(a)).toEqual([
      'ZPROG_O/ZPROG_O',
      'ZFG_A/LZFG_ATOP',
      'ZPROG_A/ZPROG_A',
      'ZPROG_A/ZPROG_A',
      'Z_FM_A@ZFG_A',
      'ZCL_A/ZCL_A',
    ]);
    // ZPROG_B and the module VIEWFRAME_ZFG have no hit: they are not
    // listed, and they count as read; the group and its modules count apart.
    expect(payloadOf(a).no_hits).toBeUndefined();
    expect(payloadOf(a).scanned).toEqual({
      objects: 7,
      sources: 8,
      objects_with_hits: 5,
    });
    expect(batched.directs).toHaveLength(0);
    expect(sequential.envelopes).toHaveLength(0);
    // Comments dropped: the same both ways too.
    const c = await search(system(), { exclude_comments: true });
    const d = await search(system(), { exclude_comments: true }, true);
    expect(textOf(c)).toBe(textOf(d));
  });

  it('phases: masks, walk levels, the sources of every target', async () => {
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
      // (3) every target's own sources (a class's main source and its four
      // local includes) and the function group structure, then the function
      // group's sources
      [
        'PROGRAM ZPROG_O',
        'STRUCTURE ZFG_A',
        'PROGRAM ZPROG_A',
        'PROGRAM ZPROG_B',
        'CLASS ZCL_A',
        'CLASSINCLUDE ZCL_A/DEFINITIONS',
        'CLASSINCLUDE ZCL_A/IMPLEMENTATIONS',
        'CLASSINCLUDE ZCL_A/MACROS',
        'CLASSINCLUDE ZCL_A/TESTCLASSES',
      ],
      [
        'FM VIEWFRAME_ZFG',
        'FM Z_FM_A',
        'INCLUDE LZFG_ATOP',
        'INCLUDE LZFG_AUXX',
      ],
    ]);
  });

  it('orders the targets by (package, type, name): the sources are read in that order', async () => {
    const fake = system();
    await search(fake);
    expect(partKeys(fake.envelopes[5])).toEqual([
      'PROGRAM ZPROG_O',
      'STRUCTURE ZFG_A',
      'PROGRAM ZPROG_A',
      'PROGRAM ZPROG_B',
      'CLASS ZCL_A',
      'CLASSINCLUDE ZCL_A/DEFINITIONS',
      'CLASSINCLUDE ZCL_A/IMPLEMENTATIONS',
      'CLASSINCLUDE ZCL_A/MACROS',
      'CLASSINCLUDE ZCL_A/TESTCLASSES',
    ]);
  });

  it('no concurrency in the schema', () => {
    expect(Object.keys(TOOL_DEFINITION.inputSchema)).not.toContain(
      'concurrency',
    );
    expect(TOOL_DEFINITION.description).not.toContain('concurrency');
  });

  it('a part that cannot be read is skipped; the others answer', async () => {
    const model = { refuse: { 'PROGRAM ZPROG_A': 500 } };
    const fake = system(model);
    const result = await search(fake);
    expect(isError(result)).toBe(false);
    const payload = payloadOf(result);
    expect(payload.failures).toBeUndefined();
    expect(hitNames(result)).toEqual([
      'ZPROG_O/ZPROG_O',
      'ZFG_A/LZFG_ATOP',
      'Z_FM_A@ZFG_A',
      'ZCL_A/ZCL_A',
    ]);
    const sequential = await search(system(model), {}, true);
    expect(textOf(result)).toBe(textOf(sequential));
  });

  it('a 404 on a source the structure listed is skipped, as on the sequential path', async () => {
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
