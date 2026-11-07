/**
 * `SearchSource` answers hits and counters only (DO15, DO17, DO19): an object
 * without a hit is not listed; what cannot be read — a source, an object, a
 * package whose root is refused or missing, a refused type node or
 * subpackage (only its branch) — is skipped with no entry and not counted; a
 * credential refusal still ends the call. Each case runs on both paths — ADT
 * batch envelopes (`served`) and the sequential reads (`absent`) — with the
 * real handler and real clients over the stand's fake connection.
 */
import { TOOL_DEFINITION } from '../../../handlers/system/readonly/handleSearchSource';
import {
  type Fake,
  isError,
  type Model,
  nodeKey,
  payloadOf,
  type Repository,
  searchOn,
  sentUrls,
  standOn,
} from '../../helpers/searchSourceStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const PATHS = [['served'], ['absent']] as const;

/**
 * `ZPKG` holds a program with a hit, one without, one whose source is not
 * there and one SAP refuses; a class whose main source hits and whose first
 * local include SAP refuses; a function group whose first module SAP refuses
 * and whose second hits. `ZTWO` holds one program with a hit.
 */
const REPO: Repository = {
  nodes: {
    [nodeKey('ZPKG')]: {
      types: [
        { type: 'PROG/P', nodeId: '000001' },
        { type: 'CLAS/OC', nodeId: '000002' },
        { type: 'FUGR/F', nodeId: '000003' },
      ],
    },
    [nodeKey('ZPKG', '1')]: {
      objects: [
        { type: 'PROG/P', name: 'ZHIT' },
        { type: 'PROG/P', name: 'ZMISS' },
        { type: 'PROG/P', name: 'ZGONE' },
        { type: 'PROG/P', name: 'ZBAD' },
      ],
    },
    [nodeKey('ZPKG', '2')]: { objects: [{ type: 'CLAS/OC', name: 'ZCL' }] },
    [nodeKey('ZPKG', '3')]: { objects: [{ type: 'FUGR/F', name: 'ZFG' }] },
    [nodeKey('ZTWO')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
    [nodeKey('ZTWO', '1')]: { objects: [{ type: 'PROG/P', name: 'ZTWOP' }] },
  },
  sources: {
    'PROGRAM ZHIT': 'marker here',
    'PROGRAM ZMISS': 'nothing here',
    'PROGRAM ZBAD': 'marker never read',
    'PROGRAM ZTWOP': 'marker two',
    'CLASS ZCL': 'marker main',
    'CLASSINCLUDE ZCL/DEFINITIONS': 'marker never read',
    'FM Z_FM_A': 'marker never read',
    'FM Z_FM_B': 'marker in b',
  },
  fugrChildren: {
    ZFG: [
      ['FUGR/FF', 'Z_FM_A'],
      ['FUGR/FF', 'Z_FM_B'],
    ],
  },
  masks: {},
};

const REFUSED: Model = {
  refuse: {
    'PROGRAM ZBAD': 500,
    'CLASSINCLUDE ZCL/DEFINITIONS': 500,
    'FM Z_FM_A': 500,
  },
};

const search = (
  fake: Fake,
  absent: boolean,
  args: Record<string, unknown> = {},
) => searchOn(fake, { query: 'marker', packages: ['ZPKG'], ...args }, absent);

const hits = (payload: {
  results: Array<{ object_name: string; include: string; line: number }>;
}) => payload.results.map((h) => `${h.object_name}/${h.include}:${h.line}`);

describe('SearchSource: only hits are answered (DO15)', () => {
  it('SearchSource does not declare emit_no_hits', () => {
    expect(Object.keys(TOOL_DEFINITION.inputSchema.shape)).not.toContain(
      'emit_no_hits',
    );
  });

  it.each(PATHS)(
    'an object without a hit is not in the answer; a call that still sends emit_no_hits has it dropped (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const plain = payloadOf(await search(standOn(REPO), absent));
      const sent = await search(standOn(REPO), absent, {
        emit_no_hits: true,
      });
      expect(isError(sent)).toBe(false);
      const payload = payloadOf(sent);
      expect(payload.no_hits).toBeUndefined();
      expect(payload).toEqual(plain);
      expect(
        payload.results.some(
          (h: { object_name: string }) => h.object_name === 'ZMISS',
        ),
      ).toBe(false);
    },
  );
});

describe('SearchSource: what cannot be read is skipped (DO17)', () => {
  it.each(PATHS)(
    'a source SAP refuses, a listed source that answers 404: skipped, no entry, no count (%s)',
    async (batch) => {
      const fake = standOn(REPO, REFUSED);
      const payload = payloadOf(await search(fake, batch === 'absent'));
      expect(payload.failures).toBeUndefined();
      expect(hits(payload)).toEqual([
        'ZCL/ZCL:1',
        'ZFG/Z_FM_B:1',
        'ZHIT/ZHIT:1',
      ]);
      // A readable source beside a refused one of the same object is searched:
      // the function group's second module after its first was refused, the
      // class's main source beside its refused local include.
      const reads = sentUrls(fake);
      expect(reads).toContain(
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_a/source/main?version=active',
      );
      expect(reads).toContain(
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_b/source/main?version=active',
      );
    },
  );

  it("a read that throws without SAP's answer is skipped (absent)", async () => {
    const fake = standOn(REPO, {
      ...REFUSED,
      throwOn: { 'PROGRAM ZHIT': 'socket hang up' },
    });
    const payload = payloadOf(await search(fake, true));
    expect(payload.failures).toBeUndefined();
    expect(hits(payload)).toEqual(['ZCL/ZCL:1', 'ZFG/Z_FM_B:1']);
  });

  it.each(PATHS)(
    'the counters count only what was done (%s)',
    async (batch) => {
      const fake = standOn(REPO, {
        refuse: { ...REFUSED.refuse, [nodeKey('ZNONE')]: 404 },
      });
      const payload = payloadOf(
        await search(fake, batch === 'absent', {
          packages: ['ZPKG', 'ZNONE'],
        }),
      );
      // ZPKG walked, ZNONE (its root 404) not; read: ZHIT, ZMISS, ZCL (its
      // main source), ZFG (its second module) — not ZGONE nor ZBAD; one
      // source each; with hits: ZHIT, ZCL, ZFG.
      expect(payload.scanned).toEqual({
        packages: 1,
        objects: 4,
        sources: 4,
        objects_with_hits: 3,
      });
      expect(payload.failures).toBeUndefined();
    },
  );

  it.each(PATHS)(
    'an object none of whose sources can be read is not in scanned.objects (%s)',
    async (batch) => {
      const fake = standOn(REPO, REFUSED);
      const payload = payloadOf(
        await search(fake, batch === 'absent', { object_filter: 'ZBAD' }),
      );
      expect(payload.results).toEqual([]);
      expect(payload.scanned).toEqual({
        packages: 1,
        objects: 0,
        sources: 0,
        objects_with_hits: 0,
      });
    },
  );

  it.each(PATHS)(
    'a named package that does not exist (its root answers 404) is skipped: no entry, not in scanned.packages (%s)',
    async (batch) => {
      const fake = standOn(REPO, { refuse: { [nodeKey('ZNONE')]: 404 } });
      const payload = payloadOf(
        await search(fake, batch === 'absent', {
          packages: ['ZNONE', 'ZTWO'],
        }),
      );
      expect(payload.failures).toBeUndefined();
      expect(hits(payload)).toEqual(['ZTWOP/ZTWOP:1']);
      expect(payload.scanned.packages).toBe(1);
    },
  );

  it.each(PATHS)(
    'a refused root is skipped: no entry, not in scanned.packages (%s)',
    async (batch) => {
      const fake = standOn(REPO, { refuse: { [nodeKey('ZPKG')]: 500 } });
      const payload = payloadOf(
        await search(fake, batch === 'absent', {
          packages: ['ZPKG', 'ZTWO'],
        }),
      );
      expect(payload.failures).toBeUndefined();
      expect(hits(payload)).toEqual(['ZTWOP/ZTWOP:1']);
      expect(payload.scanned.packages).toBe(1);
    },
  );

  it.each(PATHS)(
    'a mask that matches no package answers no packages (%s)',
    async (batch) => {
      const payload = payloadOf(
        await search(standOn(REPO), batch === 'absent', {
          packages: ['ZNOTHING*'],
        }),
      );
      expect(payload.results).toEqual([]);
      expect(payload.scanned).toEqual({
        packages: 0,
        objects: 0,
        sources: 0,
        objects_with_hits: 0,
      });
    },
  );

  it.each(PATHS)(
    'a credential refusal still ends the call: a walk, a source read (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const walk = await search(
        standOn(REPO, { refuse: { [nodeKey('ZPKG')]: 401 } }),
        absent,
      );
      expect(isError(walk)).toBe(true);
      const source = await search(
        standOn(REPO, { refuse: { 'PROGRAM ZHIT': 401 } }),
        absent,
      );
      expect(isError(source)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// A shared source that fails
// ---------------------------------------------------------------------------

/** Two function groups name the same include; each has a module of its own. */
const SHARED: Repository = {
  nodes: {
    [nodeKey('ZSHR')]: { types: [{ type: 'FUGR/F', nodeId: '000001' }] },
    [nodeKey('ZSHR', '1')]: {
      objects: [
        { type: 'FUGR/F', name: 'ZFG1' },
        { type: 'FUGR/F', name: 'ZFG2' },
      ],
    },
  },
  sources: {
    'INCLUDE LSHARED': 'marker shared',
    'FM Z_ONE': 'marker one',
    'FM Z_TWO': 'marker two',
  },
  fugrChildren: {
    ZFG1: [
      ['FUGR/I', 'LSHARED'],
      ['FUGR/FF', 'Z_ONE'],
    ],
    ZFG2: [
      ['FUGR/I', 'LSHARED'],
      ['FUGR/FF', 'Z_TWO'],
    ],
  },
  masks: {},
};

describe('SearchSource: a shared source that fails', () => {
  it.each(PATHS)(
    'is skipped for both owners: one request, no entry, the other sources still read (%s)',
    async (batch) => {
      const fake = standOn(SHARED, { refuse: { 'INCLUDE LSHARED': 500 } });
      const payload = payloadOf(
        await searchOn(
          fake,
          { query: 'marker', packages: ['ZSHR'] },
          batch === 'absent',
        ),
      );
      expect(
        sentUrls(fake).filter((url) => url.includes('/programs/includes/')),
      ).toEqual([
        '/sap/bc/adt/programs/includes/lshared/source/main?version=active',
      ]);
      expect(payload.failures).toBeUndefined();
      expect(hits(payload)).toEqual(['ZFG1/Z_ONE:1', 'ZFG2/Z_TWO:1']);
    },
  );
});

// ---------------------------------------------------------------------------
// A refused level excludes only its branch (DO19)
// ---------------------------------------------------------------------------

/**
 * `ZTYP` lists two type nodes: programs (node 1) and classes (node 2).
 * `ZPAR` holds a program of its own and two subpackages, `ZKA` (one program)
 * and `ZKB` (one program).
 */
const BRANCHES: Repository = {
  nodes: {
    [nodeKey('ZTYP')]: {
      types: [
        { type: 'PROG/P', nodeId: '000001' },
        { type: 'CLAS/OC', nodeId: '000002' },
      ],
    },
    [nodeKey('ZTYP', '1')]: { objects: [{ type: 'PROG/P', name: 'ZTPROG' }] },
    [nodeKey('ZTYP', '2')]: { objects: [{ type: 'CLAS/OC', name: 'ZTCL' }] },
    [nodeKey('ZPAR')]: {
      types: [
        { type: 'DEVC/K', nodeId: '000001' },
        { type: 'PROG/P', nodeId: '000002' },
      ],
    },
    [nodeKey('ZPAR', '1')]: {
      objects: [
        { type: 'DEVC/K', name: 'ZKA' },
        { type: 'DEVC/K', name: 'ZKB' },
      ],
    },
    [nodeKey('ZPAR', '2')]: { objects: [{ type: 'PROG/P', name: 'ZPARP' }] },
    [nodeKey('ZKA')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
    [nodeKey('ZKA', '1')]: { objects: [{ type: 'PROG/P', name: 'ZKAP' }] },
    [nodeKey('ZKB')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
    [nodeKey('ZKB', '1')]: { objects: [{ type: 'PROG/P', name: 'ZKBP' }] },
  },
  sources: {
    'PROGRAM ZTPROG': 'marker never read',
    'CLASS ZTCL': 'marker class',
    'PROGRAM ZPARP': 'marker parent',
    'PROGRAM ZKAP': 'marker sibling',
    'PROGRAM ZKBP': 'marker never read',
  },
  fugrChildren: {},
  masks: {},
};

const searchBranches = (model: Model, absent: boolean, packages: string[]) => {
  const fake = standOn(BRANCHES, model);
  return {
    fake,
    result: searchOn(fake, { query: 'marker', packages }, absent),
  };
};

describe('SearchSource: a refused level excludes only its branch (DO19)', () => {
  it.each([
    ['served', 500],
    ['absent', 500],
    ['served', 404],
    ['absent', 404],
  ] as const)(
    'a type node refused (%s, %d) excludes only that node',
    async (batch, status) => {
      const { fake, result } = searchBranches(
        { refuse: { [nodeKey('ZTYP', '1')]: status } },
        batch === 'absent',
        ['ZTYP'],
      );
      const payload = payloadOf(await result);
      expect(isError(result)).toBe(false);
      expect(hits(payload)).toEqual(['ZTCL/ZTCL:1']);
      expect(sentUrls(fake).some((url) => url.includes('ztprog'))).toBe(false);
      expect(payload.scanned.packages).toBe(1);
      expect(payload.failures).toBeUndefined();
    },
  );

  it.each([
    ['served', 500],
    ['absent', 500],
    ['served', 404],
    ['absent', 404],
  ] as const)(
    'a subpackage refused (%s, %d) excludes only its branch',
    async (batch, status) => {
      const { fake, result } = searchBranches(
        { refuse: { [nodeKey('ZKB')]: status } },
        batch === 'absent',
        ['ZPAR'],
      );
      const payload = payloadOf(await result);
      expect(hits(payload)).toEqual(['ZKAP/ZKAP:1', 'ZPARP/ZPARP:1']);
      expect(
        sentUrls(fake).some((url) => url.includes('parent_name=ZKB&node_id')),
      ).toBe(false);
      // ZPAR and ZKA walked; ZKB not.
      expect(payload.scanned.packages).toBe(2);
      expect(payload.failures).toBeUndefined();
    },
  );

  it.each(PATHS)(
    'a credential refusal at any level ends the call (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const node = await searchBranches(
        { refuse: { [nodeKey('ZTYP', '1')]: 401 } },
        absent,
        ['ZTYP'],
      ).result;
      expect(isError(node)).toBe(true);
      const sub = await searchBranches(
        { refuse: { [nodeKey('ZKB')]: 401 } },
        absent,
        ['ZPAR'],
      ).result;
      expect(isError(sub)).toBe(true);
    },
  );
});
