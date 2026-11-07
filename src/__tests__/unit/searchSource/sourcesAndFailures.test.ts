/**
 * `SearchSource` (D23a): every source-bearing object SAP lists is read through
 * its reader at the asked version; no source is lost silently; failures are
 * typed (`SourceFailure`, `OperationFailure`); one read per source per call;
 * no deadline of the server's. Each case runs on both paths — ADT batch
 * envelopes (`served`) and the sequential reads (`absent`) — with the real
 * handler and real clients over the stand's fake connection.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TOOL_DEFINITION } from '../../../handlers/system/readonly/handleSearchSource';
import {
  type Fake,
  isError,
  type Model,
  type NodeDoc,
  nodeKey,
  payloadOf,
  type Repository,
  searchOn,
  sentUrls,
  standOn,
} from '../../helpers/searchSourceStand';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** SAP's 404 to a source read: the corpus `refusal-object-not-found` body. */
const NOT_FOUND_BODY = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'tests',
    'fixtures',
    'adt',
    'refusal-object-not-found--01-read-source.body.xml',
  ),
  'utf8',
);

const PATHS = [['served'], ['absent']] as const;

const G = '/sap/bc/adt/functions/groups/zfg';

/** `ZALL` holds one object of every source-bearing type. */
const ALL_NODES: Record<string, NodeDoc> = {
  [nodeKey('ZALL')]: {
    types: [
      { type: 'PROG/P', nodeId: '000001' },
      { type: 'PROG/I', nodeId: '000002' },
      { type: 'CLAS/OC', nodeId: '000003' },
      { type: 'INTF/OI', nodeId: '000004' },
      { type: 'FUGR/F', nodeId: '000005' },
      { type: 'DDLS/DF', nodeId: '000006' },
      { type: 'BDEF/BDO', nodeId: '000007' },
      { type: 'DDLX/EX', nodeId: '000008' },
      { type: 'SRVD/SRV', nodeId: '000009' },
    ],
  },
  [nodeKey('ZALL', '1')]: { objects: [{ type: 'PROG/P', name: 'ZPROG' }] },
  [nodeKey('ZALL', '2')]: { objects: [{ type: 'PROG/I', name: 'ZINCL' }] },
  [nodeKey('ZALL', '3')]: { objects: [{ type: 'CLAS/OC', name: 'ZCL' }] },
  [nodeKey('ZALL', '4')]: { objects: [{ type: 'INTF/OI', name: 'ZIF' }] },
  [nodeKey('ZALL', '5')]: { objects: [{ type: 'FUGR/F', name: 'ZFG' }] },
  [nodeKey('ZALL', '6')]: { objects: [{ type: 'DDLS/DF', name: 'ZDDL' }] },
  [nodeKey('ZALL', '7')]: { objects: [{ type: 'BDEF/BDO', name: 'ZBDEF' }] },
  [nodeKey('ZALL', '8')]: { objects: [{ type: 'DDLX/EX', name: 'ZDDLX' }] },
  [nodeKey('ZALL', '9')]: { objects: [{ type: 'SRVD/SRV', name: 'ZSRVD' }] },
};

const ALL: Repository = {
  nodes: ALL_NODES,
  sources: {
    'PROGRAM ZPROG': 'marker program',
    'INCLUDE ZINCL': 'marker program include',
    'CLASS ZCL': 'marker class main',
    'CLASSINCLUDE ZCL/DEFINITIONS': 'marker local definitions',
    'CLASSINCLUDE ZCL/IMPLEMENTATIONS': 'marker local types',
    'CLASSINCLUDE ZCL/MACROS': 'marker macros',
    'CLASSINCLUDE ZCL/TESTCLASSES': 'marker test classes',
    'INTERFACE ZIF': 'marker interface',
    'FM Z_FM': 'marker function module',
    'FM VIEWPROC_ZFG': 'marker view module',
    'FINCLUDE ZFG/LZFGTOP': 'marker function include',
    'INCLUDE LZFGNOURI': 'marker include by name',
    'DDL ZDDL': 'marker cds',
    'BDEF ZBDEF': 'marker bdef',
    'DDLX ZDDLX': 'marker ddlx',
    'SRVD ZSRVD': 'marker srvd',
  },
  fugrChildren: {
    ZFG: [
      ['FUGR/FF', 'Z_FM', `${G}/fmodules/z_fm`],
      ['FUGR/FF', 'VIEWPROC_ZFG', `${G}/fmodules/viewproc_zfg`],
      ['FUGR/I', 'LZFGTOP', `${G}/includes/lzfgtop`],
      ['FUGR/I', 'LZFGNOURI'],
    ],
  },
  masks: {},
};

const searchAll = (fake: Fake, absent: boolean, args = {}) =>
  searchOn(
    fake,
    { query: 'marker', packages: ['ZALL'], version: 'inactive', ...args },
    absent,
  );

/** The source reads among the requests: everything but the walk. */
const sourceReads = (fake: Fake) =>
  sentUrls(fake)
    .filter((url) => !url.includes('/repository/nodestructure'))
    .sort();

describe('SearchSource: every source-bearing type, at the asked version', () => {
  it.each(PATHS)(
    'every listed type is read through its reader, each source GET at the asked version (%s)',
    async (batch) => {
      const fake = standOn(ALL);
      const result = await searchAll(fake, batch === 'absent');
      expect(isError(result)).toBe(false);
      expect(sourceReads(fake)).toEqual([
        '/sap/bc/adt/bo/behaviordefinitions/zbdef/source/main?version=inactive',
        '/sap/bc/adt/ddic/ddl/sources/zddl/source/main?version=inactive',
        '/sap/bc/adt/ddic/ddlx/sources/zddlx/source/main?version=inactive',
        '/sap/bc/adt/ddic/srvd/sources/zsrvd/source/main?version=inactive',
        '/sap/bc/adt/functions/groups/zfg/fmodules/viewproc_zfg/source/main?version=inactive',
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main?version=inactive',
        '/sap/bc/adt/functions/groups/zfg/includes/lzfgtop/source/main?version=inactive',
        '/sap/bc/adt/oo/classes/zcl/includes/definitions?version=inactive',
        '/sap/bc/adt/oo/classes/zcl/includes/implementations?version=inactive',
        '/sap/bc/adt/oo/classes/zcl/includes/macros?version=inactive',
        '/sap/bc/adt/oo/classes/zcl/includes/testclasses?version=inactive',
        '/sap/bc/adt/oo/classes/zcl/source/main?version=inactive',
        '/sap/bc/adt/oo/interfaces/zif/source/main?version=inactive',
        '/sap/bc/adt/programs/includes/lzfgnouri/source/main?version=inactive',
        '/sap/bc/adt/programs/includes/zincl/source/main?version=inactive',
        '/sap/bc/adt/programs/programs/zprog/source/main?version=inactive',
        '/sap/bc/adt/repository/objectstructure?objecttype=FUGR%2FF&objectname=ZFG',
      ]);
      const hits = payloadOf(result).results.map(
        (h: { object_type: string; object_name: string; include: string }) =>
          `${h.object_type} ${h.object_name}/${h.include}`,
      );
      expect(hits).toEqual([
        'BDEF ZBDEF/ZBDEF',
        'CLAS ZCL/ZCL',
        'CLAS ZCL/definitions',
        'CLAS ZCL/implementations',
        'CLAS ZCL/macros',
        'CLAS ZCL/testclasses',
        'DDLS ZDDL/ZDDL',
        'DDLX ZDDLX/ZDDLX',
        'FUGR ZFG/LZFGNOURI',
        'FUGR ZFG/LZFGTOP',
        'FUGR ZFG/VIEWPROC_ZFG',
        'FUGR ZFG/Z_FM',
        'INTF ZIF/ZIF',
        'PROG ZINCL/ZINCL',
        'PROG ZPROG/ZPROG',
        'SRVD ZSRVD/ZSRVD',
      ]);
      expect(payloadOf(result).failures).toBeUndefined();
    },
  );

  it('object_types accepts the new types; the default scans all of them', () => {
    const parsed = TOOL_DEFINITION.inputSchema.safeParse({
      query: 'x',
      packages: ['ZALL'],
      object_types: [
        'PROG',
        'FUGR',
        'CLAS',
        'INTF',
        'DDLS',
        'BDEF',
        'DDLX',
        'SRVD',
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it.each(PATHS)(
    'object_types narrows the scan to the types named (%s)',
    async (batch) => {
      const fake = standOn(ALL);
      const result = await searchAll(fake, batch === 'absent', {
        object_types: ['INTF', 'DDLS'],
      });
      expect(sourceReads(fake)).toEqual([
        '/sap/bc/adt/ddic/ddl/sources/zddl/source/main?version=inactive',
        '/sap/bc/adt/oo/interfaces/zif/source/main?version=inactive',
      ]);
      expect(payloadOf(result).scanned.objects).toBe(2);
    },
  );

  it.each(PATHS)(
    'a function module named VIEW… is scanned (%s)',
    async (batch) => {
      const fake = standOn(ALL);
      const result = await searchAll(fake, batch === 'absent', {
        object_types: ['FUGR'],
        query: 'view module',
      });
      expect(
        payloadOf(result).results.map((h: { include: string }) => h.include),
      ).toEqual(['VIEWPROC_ZFG']);
    },
  );
});

// ---------------------------------------------------------------------------
// No object lost silently; the failure contract
// ---------------------------------------------------------------------------

const ONE: Repository = {
  nodes: {
    [nodeKey('ZONE')]: {
      types: [
        { type: 'PROG/P', nodeId: '000001' },
        { type: 'FUGR/F', nodeId: '000002' },
      ],
    },
    [nodeKey('ZONE', '1')]: {
      objects: [
        { type: 'PROG/P', name: 'ZGONE' },
        { type: 'PROG/P', name: 'ZHERE' },
      ],
    },
    [nodeKey('ZONE', '2')]: { objects: [{ type: 'FUGR/F', name: 'ZFG' }] },
    [nodeKey('ZTWO')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
    [nodeKey('ZTWO', '1')]: { objects: [{ type: 'PROG/P', name: 'ZTWOP' }] },
  },
  sources: {
    'PROGRAM ZHERE': 'marker here',
    'PROGRAM ZTWOP': 'marker two',
    'FM Z_FM_B': 'marker in b',
  },
  fugrChildren: {
    ZFG: [
      ['FUGR/FF', 'Z_FM_A'],
      ['FUGR/FF', 'Z_FM_B'],
    ],
  },
  masks: { 'ZO*': ['ZONE'] },
};

const searchOne = (
  model: Model,
  absent: boolean,
  args: Record<string, unknown> = {},
) => {
  const fake = standOn(ONE, model);
  return {
    fake,
    result: searchOn(
      fake,
      { query: 'marker', packages: ['ZONE'], ...args },
      absent,
    ),
  };
};

describe('SearchSource: no object is lost silently', () => {
  it.each(PATHS)(
    'a 404 on a source the walk listed is reported, not taken as absent (%s)',
    async (batch) => {
      const { result } = searchOne(
        {
          refuseWith: {
            'PROGRAM ZGONE': { status: 404, body: NOT_FOUND_BODY },
          },
        },
        batch === 'absent',
        { object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZHERE']);
      expect(payload.failures).toHaveLength(1);
      const [failure] = payload.failures;
      expect(failure).toMatchObject({
        kind: 'source',
        devclass: 'ZONE',
        object_type: 'PROG',
        object_name: 'ZGONE',
        source: {
          name: 'ZGONE',
          uri: '/sap/bc/adt/programs/programs/zgone/source/main',
        },
        step: 'read program',
        t100: { id: 'SADT_RESOURCE', no: '002' },
      });
      expect(failure.error.status).toBe(404);
      expect(failure.error.step).toBe('read program');
    },
  );

  it.each(PATHS)(
    'when the first child of a function group fails and a later one succeeds, the failure is recorded and the reads go on (%s)',
    async (batch) => {
      const { fake, result } = searchOne(
        { refuse: { 'FM Z_FM_A': 500 } },
        batch === 'absent',
        { object_types: ['FUGR'] },
      );
      const payload = payloadOf(await result);
      expect(sourceReads(fake)).toEqual([
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_a/source/main?version=active',
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_b/source/main?version=active',
        '/sap/bc/adt/repository/objectstructure?objecttype=FUGR%2FF&objectname=ZFG',
      ]);
      expect(
        payload.results.map(
          (h: { object_name: string; include: string }) =>
            `${h.object_name}/${h.include}`,
        ),
      ).toEqual(['ZFG/Z_FM_B']);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'source',
        object_type: 'FUGR',
        object_name: 'ZFG',
        source: {
          name: 'Z_FM_A',
          uri: '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_a/source/main',
        },
        step: 'read function module',
      });
      expect(payload.failures[0].error.status).toBe(500);
      expect(payload.failures[0].t100).toBeUndefined();
    },
  );

  it('a non-SAP error is reported, not logged and dropped', async () => {
    const { result } = searchOne(
      { throwOn: { 'PROGRAM ZGONE': 'socket hang up' } },
      true,
      { object_types: ['PROG'] },
    );
    const payload = payloadOf(await result);
    expect(
      payload.results.map((h: { object_name: string }) => h.object_name),
    ).toEqual(['ZHERE']);
    expect(payload.failures).toHaveLength(1);
    expect(payload.failures[0]).toMatchObject({
      kind: 'source',
      object_name: 'ZGONE',
      source: {
        name: 'ZGONE',
        uri: '/sap/bc/adt/programs/programs/zgone/source/main',
      },
      step: 'read program',
    });
    expect(payload.failures[0].error.step).toBe('read program');
  });
});

describe('SearchSource: the failure contract', () => {
  it.each(PATHS)(
    'a package mask SAP refuses is an OperationFailure; the other packages are scanned (%s)',
    async (batch) => {
      const { result } = searchOne(
        { refuse: { 'SEARCH ZO*': 500 } },
        batch === 'absent',
        { packages: ['ZO*', 'ZTWO'], object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZTWOP']);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'operation',
        step: 'resolve package mask',
        mask: 'ZO*',
      });
      expect(payload.failures[0].object_name).toBeUndefined();
      expect(payload.failures[0].error.status).toBe(500);
    },
  );

  it.each(PATHS)(
    'a package walk SAP refuses is an OperationFailure with its package; the others are scanned (%s)',
    async (batch) => {
      const { result } = searchOne(
        { refuse: { [nodeKey('ZONE')]: 500 } },
        batch === 'absent',
        { packages: ['ZONE', 'ZTWO'], object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZTWOP']);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'operation',
        step: 'walk package',
        package: 'ZONE',
      });
      expect(payload.failures[0].error.status).toBe(500);
    },
  );

  it.each(PATHS)(
    'a credential refusal of a source still ends the call (%s)',
    async (batch) => {
      const { result } = searchOne(
        { refuse: { 'PROGRAM ZGONE': 401 } },
        batch === 'absent',
        { object_types: ['PROG'] },
      );
      expect(isError(await result)).toBe(true);
    },
  );

  it.each(PATHS)(
    'a credential refusal of a package mask still ends the call (%s)',
    async (batch) => {
      const { result } = searchOne(
        { refuse: { 'SEARCH ZO*': 401 } },
        batch === 'absent',
        { packages: ['ZO*', 'ZTWO'] },
      );
      expect(isError(await result)).toBe(true);
    },
  );
});

describe('SearchSource: every scope it did not read is named (review round 1)', () => {
  /** SAP's 404 with its T100 key, as the stand answers a request. */
  const keyed404 = { status: 404, body: NOT_FOUND_BODY };

  it.each(PATHS)(
    "a package's root SAP answers 404 is a walk failure with SAP's key, not an empty package (%s)",
    async (batch) => {
      const { result } = searchOne(
        { refuseWith: { [nodeKey('ZONE')]: keyed404 } },
        batch === 'absent',
        { packages: ['ZONE', 'ZTWO'], object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZTWOP']);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'operation',
        step: 'walk package',
        package: 'ZONE',
        failed_level: { package: 'ZONE' },
        t100: { id: 'SADT_RESOURCE', no: '002' },
      });
      expect(payload.failures[0].failed_level.node).toBeUndefined();
      expect(payload.failures[0].error.status).toBe(404);
    },
  );

  it.each(PATHS)(
    "a type node the root listed that SAP answers 404 is a walk failure with SAP's key (%s)",
    async (batch) => {
      const { result } = searchOne(
        { refuseWith: { [nodeKey('ZONE', '1')]: keyed404 } },
        batch === 'absent',
        { packages: ['ZONE', 'ZTWO'], object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZTWOP']);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'operation',
        step: 'walk package',
        package: 'ZONE',
        failed_level: {
          package: 'ZONE',
          node: { id: '1', type: 'PROG/P' },
        },
        t100: { id: 'SADT_RESOURCE', no: '002' },
      });
    },
  );

  it.each(PATHS)(
    'a subpackage SAP answers 404 is named as the level that failed, beside the package asked for (%s)',
    async (batch) => {
      const fake = standOn(
        {
          ...ONE,
          nodes: {
            ...ONE.nodes,
            [nodeKey('ZPAR')]: {
              types: [{ type: 'DEVC/K', nodeId: '000001' }],
            },
            [nodeKey('ZPAR', '1')]: {
              objects: [{ type: 'DEVC/K', name: 'ZKID' }],
            },
          },
        },
        { refuseWith: { [nodeKey('ZKID')]: keyed404 } },
      );
      const payload = payloadOf(
        await searchOn(
          fake,
          {
            query: 'marker',
            packages: ['ZPAR', 'ZTWO'],
            object_types: ['PROG'],
          },
          batch === 'absent',
        ),
      );
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZTWOP']);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'operation',
        step: 'walk package',
        package: 'ZPAR',
        failed_level: { package: 'ZKID' },
        t100: { id: 'SADT_RESOURCE', no: '002' },
      });
    },
  );

  it.each(PATHS)(
    "a package mask SAP refuses carries SAP's key (%s)",
    async (batch) => {
      const { result } = searchOne(
        { refuseWith: { 'SEARCH ZO*': keyed404 } },
        batch === 'absent',
        { packages: ['ZO*', 'ZTWO'], object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'operation',
        step: 'resolve package mask',
        mask: 'ZO*',
        t100: { id: 'SADT_RESOURCE', no: '002' },
      });
    },
  );

  it.each(PATHS)(
    'an early source fills the hit cap, a later child fails: the child is read and its failure named (%s)',
    async (batch) => {
      const fake = standOn(
        {
          ...ONE,
          sources: { 'FM Z_FM_A': 'marker one\nmarker two' },
        },
        { refuse: { 'FM Z_FM_B': 500 } },
      );
      const payload = payloadOf(
        await searchOn(
          fake,
          {
            query: 'marker',
            packages: ['ZONE'],
            object_types: ['FUGR'],
            max_hits_per_object: 1,
          },
          batch === 'absent',
        ),
      );
      expect(sourceReads(fake)).toEqual([
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_a/source/main?version=active',
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm_b/source/main?version=active',
        '/sap/bc/adt/repository/objectstructure?objecttype=FUGR%2FF&objectname=ZFG',
      ]);
      expect(
        payload.results.map(
          (h: { include: string; line: number }) => `${h.include}:${h.line}`,
        ),
      ).toEqual(['Z_FM_A:1']);
      expect(payload.truncated.by_object_cap).toBe(true);
      expect(payload.failures).toHaveLength(1);
      expect(payload.failures[0]).toMatchObject({
        kind: 'source',
        object_name: 'ZFG',
        source: { name: 'Z_FM_B' },
        step: 'read function module',
      });
    },
  );

  it.each(PATHS)(
    'a credential refusal after the hit cap still ends the call (%s)',
    async (batch) => {
      const fake = standOn(
        {
          ...ONE,
          sources: { 'FM Z_FM_A': 'marker one\nmarker two' },
        },
        { refuse: { 'FM Z_FM_B': 401 } },
      );
      const result = await searchOn(
        fake,
        {
          query: 'marker',
          packages: ['ZONE'],
          object_types: ['FUGR'],
          max_hits_per_object: 1,
        },
        batch === 'absent',
      );
      expect(isError(result)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// One read per source
// ---------------------------------------------------------------------------

/** Two function groups name the same include, by name (no objecturi). */
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
  sources: { 'INCLUDE LSHARED': 'marker one\nmarker two' },
  fugrChildren: {
    ZFG1: [['FUGR/I', 'LSHARED']],
    ZFG2: [['FUGR/I', 'LSHARED']],
  },
  masks: {},
};

const searchShared = (model: Model, absent: boolean) => {
  const fake = standOn(SHARED, model);
  return {
    fake,
    result: searchOn(
      fake,
      { query: 'marker', packages: ['ZSHR'], emit_no_hits: true },
      absent,
    ),
  };
};

const sharedReads = (fake: Fake) =>
  sentUrls(fake).filter((url) => url.includes('/programs/includes/'));

describe('SearchSource: one read per source', () => {
  it.each(PATHS)(
    'an include named by two objects is read once (%s)',
    async (batch) => {
      const { fake, result } = searchShared({}, batch === 'absent');
      const payload = payloadOf(await result);
      expect(sharedReads(fake)).toEqual([
        '/sap/bc/adt/programs/includes/lshared/source/main?version=active',
      ]);
      expect(
        payload.results.map(
          (h: { object_name: string; include: string; line: number }) =>
            `${h.object_name}/${h.include}:${h.line}`,
        ),
      ).toEqual([
        'ZFG1/LSHARED:1',
        'ZFG1/LSHARED:2',
        'ZFG2/LSHARED:1',
        'ZFG2/LSHARED:2',
      ]);
    },
  );

  it.each(PATHS)('a cache hit counts for both owners (%s)', async (batch) => {
    const { result } = searchShared({}, batch === 'absent');
    const payload = payloadOf(await result);
    expect(payload.scanned).toEqual({ packages: 1, objects: 2, sources: 2 });
    expect(payload.no_hits).toEqual([]);
  });

  it.each(PATHS)(
    'a shared failure is recorded for both owners (%s)',
    async (batch) => {
      const { fake, result } = searchShared(
        { refuse: { 'INCLUDE LSHARED': 500 } },
        batch === 'absent',
      );
      const payload = payloadOf(await result);
      expect(sharedReads(fake)).toEqual([
        '/sap/bc/adt/programs/includes/lshared/source/main?version=active',
      ]);
      expect(
        payload.failures.map(
          (f: {
            kind: string;
            object_name: string;
            source: { name: string };
          }) => `${f.kind} ${f.object_name}/${f.source.name}`,
        ),
      ).toEqual(['source ZFG1/LSHARED', 'source ZFG2/LSHARED']);
    },
  );
});

// ---------------------------------------------------------------------------
// No deadline of the server's (owner decision DO11, option b)
// ---------------------------------------------------------------------------

describe('SearchSource: paging by start_at and max_objects only', () => {
  it('the schema declares neither time_budget_ms nor timeout', () => {
    const keys = Object.keys(TOOL_DEFINITION.inputSchema.shape);
    expect(keys).not.toContain('time_budget_ms');
    expect(keys).not.toContain('timeout');
  });

  it.each(PATHS)(
    'a scan never stops on time: every target is answered however the clock moves (%s)',
    async (batch) => {
      let clock = 0;
      const spy = jest.spyOn(Date, 'now').mockImplementation(() => {
        clock += 1_000_000_000;
        return clock;
      });
      try {
        const fake = standOn(ALL);
        const result = await searchAll(fake, batch === 'absent', {
          time_budget_ms: 1,
        });
        const payload = payloadOf(result);
        expect(payload.scanned.objects).toBe(9);
        expect(payload.next_start_at).toBeUndefined();
        expect(payload.truncated).toEqual({
          by_object_cap: false,
          by_max_objects: false,
        });
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each(PATHS)(
    'next_start_at comes only from max_objects (%s)',
    async (batch) => {
      const fake = standOn(ALL);
      const result = await searchAll(fake, batch === 'absent', {
        max_objects: 4,
      });
      const payload = payloadOf(result);
      expect(payload.next_start_at).toBe(4);
      expect(payload.total_targets).toBe(9);
      expect(payload.truncated.by_max_objects).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// The description
// ---------------------------------------------------------------------------

describe('SearchSource: the description is functional', () => {
  const description: string = TOOL_DEFINITION.description;

  it.each([
    'Run only ONE SearchSource',
    'Prefer combining',
    'For certainty',
    'time_budget_ms',
    'timeout',
    'best-effort',
    'always go against the active version',
  ])('carries no advice or stale contract: %s', (text) => {
    expect(description).not.toContain(text);
  });

  it('names what it reads, its version, its paging and its failures', () => {
    for (const text of [
      'programs, program includes',
      'function groups (function modules and includes)',
      'classes (main source and the four local includes)',
      'interfaces',
      'CDS data definitions',
      'behavior definitions',
      'metadata extensions',
      'service definitions',
      '`version`',
      '`next_start_at`',
      '`failures`',
    ]) {
      expect(description).toContain(text);
    }
  });
});
