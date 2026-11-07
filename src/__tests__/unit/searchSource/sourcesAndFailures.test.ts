/**
 * `SearchSource` (D23a): every source-bearing object SAP lists is read through
 * its reader at the asked version; what cannot be read is skipped and the
 * reads go on (DO17); one read per source per call; no deadline of the
 * server's; and D23b's masks, line-match strategy, hits
 * and counters, branch rule and single run (kept in this one file so the
 * suite loads the handler once). Each case runs on both paths — ADT batch
 * envelopes (`served`) and the sequential reads (`absent`) — with the real
 * handler and real clients over the stand's fake connection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { TOOL_DEFINITION as BDEFT } from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { TOOL_DEFINITION as CLAST } from '../../../handlers/class/high/handleGetClass';
import { TOOL_DEFINITION as LDEF } from '../../../handlers/class/high/handleGetLocalDefinitions';
import { TOOL_DEFINITION as LMAC } from '../../../handlers/class/high/handleGetLocalMacros';
import { TOOL_DEFINITION as LTST } from '../../../handlers/class/high/handleGetLocalTestClass';
import { TOOL_DEFINITION as LTYP } from '../../../handlers/class/high/handleGetLocalTypes';
import { TOOL_DEFINITION as DDLT } from '../../../handlers/ddl/high/handleGetDdl';
import { TOOL_DEFINITION as FINC } from '../../../handlers/function_include/readonly/handleGetFunctionInclude';
import { TOOL_DEFINITION as FM } from '../../../handlers/function_module/high/handleGetFunctionModule';
import { TOOL_DEFINITION as INC } from '../../../handlers/include/readonly/handleGetInclude';
import { TOOL_DEFINITION as INTFT } from '../../../handlers/interface/high/handleGetInterface';
import { TOOL_DEFINITION as DDLXT } from '../../../handlers/metadata_extension/high/handleGetMetadataExtension';
import { TOOL_DEFINITION as PROGT } from '../../../handlers/program/high/handleGetProgram';
import { TOOL_DEFINITION as SRVDT } from '../../../handlers/service_definition/high/handleGetServiceDefinition';
import { TOOL_DEFINITION } from '../../../handlers/system/readonly/handleSearchSource';
import type {
  LineMatchStrategy,
  ScanInput,
} from '../../../lib/search-source/lineMatch';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  type OrchestratorInput,
  runSearchSource,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import type { PackageContentItem } from '../../../lib/search-source/packageEnumerator';
import {
  createPackagePatternResolver,
  resolvePackagePatterns,
} from '../../../lib/search-source/packageResolver';
import {
  type SapAnswerDecision,
  type SapAnswerPlace,
  type SapAnswerStrategy,
  skipSapAnswers,
  undecided,
} from '../../../lib/search-source/readFailure';
import { carryingFailure } from '../../../lib/strategies/step';
import { statusError } from '../../helpers/batchEnvelope';
import { recordingConnection } from '../../helpers/recordingConnection';
import {
  contextOn,
  type Fake,
  hitLabel,
  isError,
  keyOf,
  type Model,
  type NodeDoc,
  nodeKey,
  payloadOf,
  type Repository,
  searchesOf,
  searchOn,
  sentUrls,
  standOn,
  textOf,
} from '../../helpers/searchSourceStand';
import {
  exactPackages,
  listing,
  sourcesFrom,
} from '../../helpers/sourceReaderFake';

/** The read tools a hit's fields must fill, by name: their argument schemas. */
const READ_TOOLS: Record<
  string,
  { safeParse(value: unknown): { success: boolean } }
> = {
  GetFunctionModule: FM.inputSchema,
  GetFunctionInclude: FINC.inputSchema,
  GetInclude: INC.inputSchema,
  GetProgram: PROGT.inputSchema,
  GetClass: CLAST.inputSchema,
  GetLocalDefinitions: LDEF.inputSchema,
  GetLocalTypes: LTYP.inputSchema,
  GetLocalMacros: LMAC.inputSchema,
  GetLocalTestClass: LTST.inputSchema,
  GetInterface: INTFT.inputSchema,
  GetDdl: DDLT.inputSchema,
  GetBehaviorDefinition: BDEFT.inputSchema,
  GetMetadataExtension: DDLXT.inputSchema,
  GetServiceDefinition: SRVDT.inputSchema,
};

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
        (h: {
          object_type: string;
          object_name: string;
          include?: string;
          function_group_name?: string;
        }) => `${h.object_type} ${hitLabel(h)}`,
      );
      expect(hits).toEqual([
        'FUGR/FF VIEWPROC_ZFG@ZFG',
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
        'INTF ZIF/ZIF',
        'PROG ZINCL/ZINCL',
        'PROG ZPROG/ZPROG',
        'SRVD ZSRVD/ZSRVD',
        'FUGR/FF Z_FM@ZFG',
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
      expect(payloadOf(result).results.map(hitLabel)).toEqual([
        'VIEWPROC_ZFG@ZFG',
      ]);
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

describe('SearchSource: what cannot be read is skipped, the reads go on (DO17)', () => {
  it.each(PATHS)(
    'a listed source that answers 404 is skipped: no entry, no count (%s)',
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
      expect(payload.failures).toBeUndefined();
      expect(payload.scanned).toEqual({
        packages: 1,
        objects: 1,
        sources: 1,
        objects_with_hits: 1,
      });
    },
  );

  it.each(PATHS)(
    'when the first child of a function group fails and a later one succeeds, the later one is searched (%s)',
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
          (h: {
            object_name: string;
            include?: string;
            function_group_name?: string;
          }) => hitLabel(h),
        ),
      ).toEqual(['Z_FM_B@ZFG']);
      expect(payload.failures).toBeUndefined();
    },
  );

  it('a failure with no response is thrown: the call fails (DO22)', async () => {
    const { result } = searchOne(
      { throwOn: { 'PROGRAM ZGONE': 'socket hang up' } },
      true,
      { object_types: ['PROG'] },
    );
    const answered = await result;
    expect(isError(answered)).toBe(true);
    expect(textOf(answered)).toContain('socket hang up');
  });
});

describe('SearchSource: package-level outcomes are skipped (DO17)', () => {
  it.each(PATHS)(
    'a mask whose quick search SAP refuses is skipped: no entry; the other packages are scanned (%s)',
    async (batch) => {
      const { result } = searchOne(
        { refuseWith: { 'SEARCH ZO*': { status: 404, body: NOT_FOUND_BODY } } },
        batch === 'absent',
        { packages: ['ZO*', 'ZTWO'], object_types: ['PROG'] },
      );
      const payload = payloadOf(await result);
      expect(
        payload.results.map((h: { object_name: string }) => h.object_name),
      ).toEqual(['ZTWOP']);
      expect(payload.failures).toBeUndefined();
      expect(payload.scanned.packages).toBe(1);
    },
  );

  it.each(PATHS)(
    'a package walk SAP refuses is skipped: no entry, not counted; the others are scanned (%s)',
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
      expect(payload.failures).toBeUndefined();
      expect(payload.scanned.packages).toBe(1);
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

describe('SearchSource: a missing level is skipped; below the root only its branch (DO17, DO19)', () => {
  /** SAP's 404 with its T100 key, as the stand answers a request. */
  const keyed404 = { status: 404, body: NOT_FOUND_BODY };

  it.each(PATHS)(
    "a package's root SAP answers 404 is skipped: no entry, not counted (%s)",
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
      expect(payload.failures).toBeUndefined();
      expect(payload.scanned.packages).toBe(1);
    },
  );

  it.each(PATHS)(
    'a type node the root listed that SAP answers 404 excludes only that node (%s)',
    async (batch) => {
      const { result } = searchOne(
        { refuseWith: { [nodeKey('ZONE', '1')]: keyed404 } },
        batch === 'absent',
        { packages: ['ZONE', 'ZTWO'] },
      );
      const payload = payloadOf(await result);
      // ZONE's programs are excluded; its function group is searched.
      expect(
        payload.results.map(
          (h: {
            object_name: string;
            include?: string;
            function_group_name?: string;
          }) => hitLabel(h),
        ),
      ).toEqual(['Z_FM_B@ZFG', 'ZTWOP/ZTWOP']);
      expect(payload.failures).toBeUndefined();
      expect(payload.scanned.packages).toBe(2);
    },
  );

  it.each(PATHS)(
    'a subpackage SAP answers 404 excludes only that subpackage (%s)',
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
      expect(payload.failures).toBeUndefined();
      // ZPAR and ZTWO walked; ZKID not.
      expect(payload.scanned.packages).toBe(2);
    },
  );

  it.each(PATHS)(
    'an early source fills the hit cap, a later child fails: the child is read and skipped (%s)',
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
          (h: {
            object_name: string;
            include?: string;
            function_group_name?: string;
            line: number;
          }) => `${hitLabel(h)}:${h.line}`,
        ),
      ).toEqual(['Z_FM_A@ZFG:1']);
      expect(payload.truncated.by_object_cap).toBe(true);
      expect(payload.failures).toBeUndefined();
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
    result: searchOn(fake, { query: 'marker', packages: ['ZSHR'] }, absent),
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
          (h: {
            object_name: string;
            include?: string;
            function_group_name?: string;
            line: number;
          }) => `${hitLabel(h)}:${h.line}`,
        ),
      ).toEqual([
        'ZFG1/LSHARED:1',
        'ZFG1/LSHARED:2',
        'ZFG2/LSHARED:1',
        'ZFG2/LSHARED:2',
      ]);
    },
  );

  it.each(PATHS)(
    'a cache hit counts for both owners; the source read once counts once (%s)',
    async (batch) => {
      const { result } = searchShared({}, batch === 'absent');
      const payload = payloadOf(await result);
      expect(payload.scanned).toEqual({
        packages: 1,
        objects: 2,
        sources: 1,
        objects_with_hits: 2,
      });
    },
  );

  it.each(PATHS)(
    'a shared failure is skipped for both owners: one request, no entry (%s)',
    async (batch) => {
      const { fake, result } = searchShared(
        { refuse: { 'INCLUDE LSHARED': 500 } },
        batch === 'absent',
      );
      const payload = payloadOf(await result);
      expect(sharedReads(fake)).toEqual([
        '/sap/bc/adt/programs/includes/lshared/source/main?version=active',
      ]);
      expect(payload.failures).toBeUndefined();
      expect(payload.results).toEqual([]);
      expect(payload.scanned.objects).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------
// No deadline of the server's (owner decision DO11, option b)
// ---------------------------------------------------------------------------

describe("SearchSource: no deadline of the server's", () => {
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
        // Nine objects and the function group's two modules (DO18).
        expect(payload.scanned.objects).toBe(11);
        expect(payload.truncated).toEqual({ by_object_cap: false });
      } finally {
        spy.mockRestore();
      }
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
    'of up to 1000 packages',
    'emit_no_hits',
    'no_hits',
    'failures',
    'start_at',
    'max_objects',
    'total_targets',
    'next_start_at',
    'by_max_objects',
    'default 100',
  ])('carries no advice or stale contract: %s', (text) => {
    expect(description).not.toContain(text);
  });

  it('names what it reads, its version, its masks, what it skips and its counters', () => {
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
      '`*` (zero or more characters) and `?` (one character) are the wildcards',
      '`+`, `_`, `%` and `#` are characters of the name',
      'every package it matches',
      'every target is read in one run, unless `max_hits` is reached',
      '`answer`',
      '`objects`',
      '`lines`',
      '`snippets` (the default)',
      '`max_hits`',
      '`truncated.by_max_hits`',
      'the sources of the last batch read, those read past the stop included',
      'skipped',
      '`scanned.packages`',
      '`scanned.objects`',
      '`scanned.sources` the sources read (each once)',
      '`scanned.objects_with_hits`',
      'only when given',
      'a hit in a function module names the module: `object_type` `FUGR/FF`, its name and `function_group_name`',
    ]) {
      expect(description).toContain(text);
    }
  });

  it('max_hits_per_object states no default', () => {
    const field = TOOL_DEFINITION.inputSchema.shape.max_hits_per_object;
    expect(field.description).not.toContain('default');
    expect(field.description).toContain('absent, no limit');
  });
});

// ---------------------------------------------------------------------------
// D23b: package masks (DO12)
// ---------------------------------------------------------------------------

/**
 * `SearchSource`'s package masks (DO12): a mask is resolved by the quick
 * search, its `maxResults` doubled until the answer holds fewer packages than
 * `maxResults`. On the batched path every round of every unresolved mask is a
 * search phase of its own, repeated until every mask is resolved; a search not
 * answered yet never counts as a short answer. The sequential path answers
 * alike.
 *
 * Real handler, real clients, real `AdtBatchConnection`; only the connection
 * is a fake. The quick search answers the first `maxResults` packages, as SAP
 * does (measured: no cap, no "more" marker).
 */
describe('D23b: package masks (DO12)', () => {
  /** `count` package names: `<prefix>000001`, … */
  const names = (prefix: string, count: number): string[] =>
    Array.from(
      { length: count },
      (_, i) => `${prefix}${String(i + 1).padStart(6, '0')}`,
    );

  /**
   * The repository: the masks' packages; the last package of each mask holds
   * one program with a hit, every other package is empty.
   */
  function repositoryOf(masks: Record<string, string[]>): Repository {
    const nodes: Record<string, NodeDoc> = {};
    const sources: Record<string, string> = {};
    for (const packages of Object.values(masks)) {
      for (const name of packages) nodes[nodeKey(name)] = {};
      const last = packages[packages.length - 1];
      if (last === undefined) continue;
      const program = `P${last}`;
      nodes[nodeKey(last)] = { types: [{ type: 'PROG/P', nodeId: '000020' }] };
      nodes[nodeKey(last, '20')] = {
        objects: [{ type: 'PROG/P', name: program }],
      };
      sources[`PROGRAM ${program}`] = "WRITE 'marker'.";
    }
    return { nodes, sources, fugrChildren: {}, masks };
  }

  const run = (fake: Fake, packages: string[], sequential: boolean) =>
    searchOn(
      fake,
      { query: 'marker', packages, include_subpackages: false },
      sequential,
      100_000,
    );

  /** The package roots a fake was asked for, in order. */
  const walkedRoots = (fake: Fake, sequential = false): string[] =>
    (sequential
      ? fake.directs.map((r) => {
          const u = new URL(r.url, 'https://system.invalid');
          for (const [k, v] of Object.entries(r.params ?? {})) {
            u.searchParams.set(k, String(v));
          }
          return u;
        })
      : fake.envelopes.flatMap((e) =>
          e.parts.map((p) => new URL(p.url, 'https://system.invalid')),
        )
    )
      .filter(
        (u) =>
          u.pathname.endsWith('/repository/nodestructure') &&
          !u.searchParams.has('node_id'),
      )
      .map((u) => u.searchParams.get('parent_name') ?? '');

  describe.each([
    ['batched', false],
    ['sequential', true],
  ])('SearchSource masks on the %s path', (_path, sequential) => {
    it('a mask whose first answer is full is resolved', async () => {
      const all = names('ZA', 1001);
      const fake = standOn(repositoryOf({ 'ZA*': all }));
      const result = await run(fake, ['ZA*'], sequential);
      expect(isError(result)).toBe(false);
      expect(searchesOf(fake)).toEqual([
        ['ZA*', 1000],
        ['ZA*', 2000],
      ]);
      const answer = payloadOf(result);
      expect(answer.scanned.packages).toBe(1001);
      expect(
        answer.results.map((h: { devclass: string }) => h.devclass),
      ).toEqual([all[1000]]);
      if (!sequential) {
        // Each round is a phase of its own: one envelope per round.
        expect(fake.envelopes[0]?.parts).toHaveLength(1);
        expect(fake.envelopes[1]?.parts).toHaveLength(1);
        expect(new Set(walkedRoots(fake)).size).toBe(1001);
      } else {
        expect(new Set(walkedRoots(fake, true)).size).toBe(1001);
      }
    });

    it('a mask that fills maxResults twice is resolved', async () => {
      const all = names('ZB', 2001);
      const fake = standOn(repositoryOf({ 'ZB*': all }));
      const result = await run(fake, ['ZB*'], sequential);
      expect(searchesOf(fake)).toEqual([
        ['ZB*', 1000],
        ['ZB*', 2000],
        ['ZB*', 4000],
      ]);
      const answer = payloadOf(result);
      expect(answer.scanned.packages).toBe(2001);
      expect(
        answer.results.map((h: { devclass: string }) => h.devclass),
      ).toEqual([all[2000]]);
    });

    it('a search not answered yet is not taken as a short answer: the mask is cut nowhere', async () => {
      const all = names('ZC', 1000);
      const fake = standOn(repositoryOf({ 'ZC*': all }));
      const result = await run(fake, ['ZC*'], sequential);
      // 1000 fills the first round; the second answers the same 1000, short.
      expect(searchesOf(fake)).toEqual([
        ['ZC*', 1000],
        ['ZC*', 2000],
      ]);
      expect(payloadOf(result).scanned.packages).toBe(1000);
    });

    it('masks of different depths resolve together, no search sent twice', async () => {
      const shallow = names('ZD', 5);
      const deep = names('ZE', 2001);
      const fake = standOn(repositoryOf({ 'ZD*': shallow, 'ZE*': deep }));
      const result = await run(fake, ['ZD*', 'ZE*'], sequential);
      const searches = searchesOf(fake);
      expect(searches).toHaveLength(new Set(searches.map(String)).size);
      if (sequential) {
        expect(searches).toEqual([
          ['ZD*', 1000],
          ['ZE*', 1000],
          ['ZE*', 2000],
          ['ZE*', 4000],
        ]);
      } else {
        // Round by round, every unresolved mask's search in one phase.
        expect(fake.envelopes.slice(0, 3).map((e) => e.parts.length)).toEqual([
          2, 1, 1,
        ]);
        expect(searches).toEqual([
          ['ZD*', 1000],
          ['ZE*', 1000],
          ['ZE*', 2000],
          ['ZE*', 4000],
        ]);
      }
      const answer = payloadOf(result);
      expect(answer.scanned.packages).toBe(2006);
      expect(
        answer.results.map((h: { devclass: string }) => h.devclass).sort(),
      ).toEqual([shallow[4], deep[2000]]);
    });

    it('a mask SAP refuses at a later round is skipped with no entry; the other entries are scanned', async () => {
      const fake = standOn(
        repositoryOf({ 'ZF*': names('ZF', 1000), 'ZG*': names('ZG', 1) }),
        { refuse: { 'SEARCH ZF*@2000': 500 } },
      );
      const result = await run(fake, ['ZF*', 'ZG*'], sequential);
      expect(isError(result)).toBe(false);
      expect(searchesOf(fake)).toEqual(
        sequential
          ? [
              ['ZF*', 1000],
              ['ZF*', 2000],
              ['ZG*', 1000],
            ]
          : [
              ['ZF*', 1000],
              ['ZG*', 1000],
              ['ZF*', 2000],
            ],
      );
      const answer = payloadOf(result);
      expect(answer.failures).toBeUndefined();
      expect(answer.scanned.packages).toBe(1);
      expect(walkedRoots(fake, sequential)).toEqual(['ZG000001']);
      expect(
        answer.results.map((h: { devclass: string }) => h.devclass),
      ).toEqual(['ZG000001']);
    });

    it('a credential failure of a mask search ends the call', async () => {
      const fake = standOn(repositoryOf({ 'ZH*': names('ZH', 3) }), {
        refuse: { 'SEARCH ZH*': 401 },
      });
      const result = await run(fake, ['ZH*'], sequential);
      expect(isError(result)).toBe(true);
      expect(payloadOf(result).status).toBe(401);
      expect(walkedRoots(fake, sequential)).toEqual([]);
    });
  });
  it('a mask named twice is searched once; a credential refusal of that search ends the call (served)', async () => {
    const fake = standOn(repositoryOf({ 'ZD*': names('ZD', 3) }), {
      refuseOnce: { 'SEARCH ZD*': 401 },
    });
    const result = await run(fake, ['ZD*', 'ZD*'], false);
    expect(searchesOf(fake)).toEqual([['ZD*', 1000]]);
    expect(isError(result)).toBe(true);
    expect(payloadOf(result).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// D23b: the line match is a strategy (DO14)
// ---------------------------------------------------------------------------

/**
 * The line match is a strategy the orchestrator is given (DO14): it receives
 * each source's lines and the call's terms, its hits are the answer's, on the
 * sequential path and on the batched path alike; the orchestrator has no
 * match of its own.
 */
describe('D23b: the line match is a strategy (DO14)', () => {
  interface Seen {
    lines: readonly string[];
    input: ScanInput;
  }

  /** A strategy answering one hit on each source's second line, its own words. */
  function recording(): { strategy: LineMatchStrategy; seen: Seen[] } {
    const seen: Seen[] = [];
    return {
      seen,
      strategy: {
        match(lines, input) {
          seen.push({ lines, input });
          return {
            hits: [{ line: 2, snippet: 'chosen by the strategy' }],
            capped: false,
          };
        },
      },
    };
  }

  const ASKED = {
    query: 'never-in-the-source',
    query2: 'second',
    exclude: ['dropped'],
    exclude_comments: true,
    packages: ['ZPKG'],
    max_hits_per_object: 7,
  };

  describe('the orchestrator matches lines through the strategy it is given', () => {
    it('on the sequential path', async () => {
      const { strategy, seen } = recording();
      const result = await runSearchSource(
        {
          lineMatch: strategy,
          sapAnswers: skipSapAnswers,
          fetchPackageContents: async (name) =>
            listing(name, [
              {
                name: 'ZPROG',
                type: 'PROG/P',
                packageName: 'ZPKG',
                isPackage: false,
              },
            ]),
          sourceReader: sourcesFrom({ 'PROG:ZPROG': 'first\nsecond' }),
          resolvePackages: exactPackages,
        },
        ASKED,
      );
      expect(seen).toEqual([
        {
          lines: ['first', 'second'],
          input: {
            query: 'never-in-the-source',
            query2: 'second',
            exclude: ['dropped'],
            exclude_comments: true,
            max_hits: 7,
          },
        },
      ]);
      expect(result.results).toEqual([
        expect.objectContaining({
          object_name: 'ZPROG',
          line: 2,
          snippet: 'chosen by the strategy',
        }),
      ]);
    });

    it('on the batched path', async () => {
      const repository: Repository = {
        nodes: {
          [nodeKey('ZPKG')]: { types: [{ type: 'PROG/P', nodeId: '000020' }] },
          [nodeKey('ZPKG', '20')]: {
            objects: [{ type: 'PROG/P', name: 'ZPROG' }],
          },
        },
        sources: { 'PROGRAM ZPROG': 'first\nsecond' },
        fugrChildren: {},
        masks: {},
      };
      const fake = standOn(repository);
      const { strategy, seen } = recording();
      const result = await runSearchSourceWithContext(contextOn(fake), ASKED, {
        lineMatch: strategy,
        sapAnswers: skipSapAnswers,
      });
      expect(fake.envelopes.length).toBeGreaterThan(0);
      expect(fake.directs).toHaveLength(0);
      expect(seen.map((s) => s.lines)).toEqual([['first', 'second']]);
      expect(seen[0]?.input).toEqual({
        query: 'never-in-the-source',
        query2: 'second',
        exclude: ['dropped'],
        exclude_comments: true,
        max_hits: 7,
      });
      expect(
        result.results.map((h) => ('snippet' in h ? h.snippet : '')),
      ).toEqual(['chosen by the strategy']);
    });
  });

  describe('the orchestrator has no line match of its own', () => {
    it('imports no matcher', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../../../lib/search-source/orchestrator.ts'),
        'utf8',
      );
      expect(source.includes("from './lineScanner'")).toBe(false);
      expect(source.includes('scanLines')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// D23b: hits and counters only (DO15, DO17, DO19)
// ---------------------------------------------------------------------------

/**
 * `SearchSource` answers hits and counters only (DO15, DO17, DO19): an object
 * without a hit is not listed; what cannot be read — a source, an object, a
 * package whose root is refused or missing, a refused type node or
 * subpackage (only its branch) — is skipped with no entry and not counted; a
 * credential refusal still ends the call. Each case runs on both paths — ADT
 * batch envelopes (`served`) and the sequential reads (`absent`) — with the
 * real handler and real clients over the stand's fake connection.
 */
describe('D23b: hits and counters only (DO15, DO17, DO19)', () => {
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
    results: Array<{
      object_name: string;
      include?: string;
      function_group_name?: string;
      line: number;
    }>;
  }) => payload.results.map((h) => `${hitLabel(h)}:${h.line}`);

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
          'ZHIT/ZHIT:1',
          'Z_FM_B@ZFG:1',
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

    it("a read that throws without SAP's answer is thrown (absent; DO22)", async () => {
      const fake = standOn(REPO, {
        ...REFUSED,
        throwOn: { 'PROGRAM ZHIT': 'socket hang up' },
      });
      expect(isError(await search(fake, true))).toBe(true);
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
        expect(hits(payload)).toEqual(['Z_ONE@ZFG1:1', 'Z_TWO@ZFG2:1']);
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

  const searchBranches = (
    model: Model,
    absent: boolean,
    packages: string[],
  ) => {
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
        expect(sentUrls(fake).some((url) => url.includes('ztprog'))).toBe(
          false,
        );
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
});

// ---------------------------------------------------------------------------
// D23b: no paging (DO20)
// ---------------------------------------------------------------------------

/**
 * `SearchSource` reads every target in one run (DO20): no `max_objects`, no
 * `start_at`, no cursor in the answer; `max_hits_per_object` limits each
 * object only when given. Each case runs on both paths — ADT batch envelopes
 * (`served`) and the sequential reads (`absent`) — with the real handler and
 * real clients over the stand's fake connection.
 */
describe('D23b: no paging (DO20)', () => {
  const PATHS = [['served'], ['absent']] as const;

  /** `ZBIG` holds `count` programs, each with one hit. */
  function big(count: number): Repository {
    const programs = Array.from(
      { length: count },
      (_, i) => `ZP${String(i + 1).padStart(4, '0')}`,
    );
    return {
      nodes: {
        [nodeKey('ZBIG')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
        [nodeKey('ZBIG', '1')]: {
          objects: programs.map((name) => ({ type: 'PROG/P', name })),
        },
      },
      sources: Object.fromEntries(
        programs.map((name) => [`PROGRAM ${name}`, "WRITE 'marker'."]),
      ),
      fugrChildren: {},
      masks: {},
    };
  }

  /** `ZHITS` holds `ZMANY` (150 hits) and `ZFEW` (2 hits). */
  const HITS: Repository = {
    nodes: {
      [nodeKey('ZHITS')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
      [nodeKey('ZHITS', '1')]: {
        objects: [
          { type: 'PROG/P', name: 'ZMANY' },
          { type: 'PROG/P', name: 'ZFEW' },
        ],
      },
    },
    sources: {
      'PROGRAM ZMANY': Array.from({ length: 150 }, () => 'marker').join('\n'),
      'PROGRAM ZFEW': 'marker\nmarker',
    },
    fugrChildren: {},
    masks: {},
  };

  const count = (payload: { results: Array<{ object_name: string }> }) => {
    const out: Record<string, number> = {};
    for (const h of payload.results) {
      out[h.object_name] = (out[h.object_name] ?? 0) + 1;
    }
    return out;
  };

  describe('SearchSource: no paging (DO20)', () => {
    it('SearchSource does not declare max_objects or start_at; no field names a package or object limit', () => {
      const keys = Object.keys(TOOL_DEFINITION.inputSchema.shape);
      expect(keys).not.toContain('max_objects');
      expect(keys).not.toContain('start_at');
      expect(keys).not.toContain('maxResults');
      // The two limits are hit limits (DO23), none of packages or objects.
      expect(keys.filter((k) => k.startsWith('max_'))).toEqual([
        'max_hits_per_object',
        'max_hits',
      ]);
    });

    it.each(PATHS)(
      'every target is read in one call; the answer has no cursor fields (%s)',
      async (batch) => {
        const result = await searchOn(
          standOn(big(501)),
          { query: 'marker', packages: ['ZBIG'] },
          batch === 'absent',
          4000,
        );
        expect(isError(result)).toBe(false);
        const payload = payloadOf(result);
        expect(payload.results).toHaveLength(501);
        expect(payload.scanned.objects).toBe(501);
        expect(payload.total_targets).toBeUndefined();
        expect(payload.next_start_at).toBeUndefined();
        expect(payload.truncated).toEqual({ by_object_cap: false });
      },
    );

    it.each(PATHS)(
      'a call that still sends max_objects or start_at has them dropped (%s)',
      async (batch) => {
        const absent = batch === 'absent';
        const plain = payloadOf(
          await searchOn(
            standOn(big(5)),
            { query: 'marker', packages: ['ZBIG'] },
            absent,
          ),
        );
        const sent = await searchOn(
          standOn(big(5)),
          { query: 'marker', packages: ['ZBIG'], max_objects: 2, start_at: 3 },
          absent,
        );
        expect(isError(sent)).toBe(false);
        expect(payloadOf(sent)).toEqual(plain);
        expect(plain.results).toHaveLength(5);
      },
    );

    it.each(PATHS)(
      'max_hits_per_object absent means no limit (%s)',
      async (batch) => {
        const payload = payloadOf(
          await searchOn(
            standOn(HITS),
            { query: 'marker', packages: ['ZHITS'] },
            batch === 'absent',
          ),
        );
        expect(count(payload)).toEqual({ ZMANY: 150, ZFEW: 2 });
        expect(payload.truncated.by_object_cap).toBe(false);
      },
    );

    it.each(PATHS)(
      'max_hits_per_object given limits each object; the flag is set by the object that passed it (%s)',
      async (batch) => {
        const payload = payloadOf(
          await searchOn(
            standOn(HITS),
            { query: 'marker', packages: ['ZHITS'], max_hits_per_object: 3 },
            batch === 'absent',
          ),
        );
        expect(count(payload)).toEqual({ ZMANY: 3, ZFEW: 2 });
        expect(payload.truncated.by_object_cap).toBe(true);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// D23b: the package masks on the wire
// ---------------------------------------------------------------------------

/**
 * Pins of the package masks on the wire (D23b Step 6): the quick searches the
 * real client sends for a mask — the doubling sequence of `maxResults`, a `?`
 * mask sent as given — and none for an exact name with a literal `_`.
 *
 * The corpus records no quick-search exchange, so the answers are documents
 * of the shape the quick search answers (`adtcore:objectReferences`); a live
 * capture is owed (D23b Step 7).
 */
describe('D23b: the package masks on the wire', () => {
  /** A quick-search answer naming `count` packages. */
  const answerOf = (count: number) => ({
    status: 200,
    data: `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${Array.from(
      { length: count },
      (_, i) => {
        const name = `ZP${String(i + 1).padStart(6, '0')}`;
        return `<adtcore:objectReference adtcore:uri="/sap/bc/adt/packages/${name.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${name}" adtcore:packageName="${name}"/>`;
      },
    ).join('')}</adtcore:objectReferences>`,
  });

  /** The query parameters of a recorded request: its URL's, then its params. */
  function paramsOf(request: { url: string; params?: unknown }) {
    const url = new URL(request.url, 'https://system.invalid');
    const out: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      out[key] = value;
    });
    for (const [key, value] of Object.entries(
      (request.params ?? {}) as Record<string, unknown>,
    )) {
      out[key] = String(value);
    }
    return { path: url.pathname, query: out.query, maxResults: out.maxResults };
  }

  describe('the package masks on the wire', () => {
    it('a mask fills 1000, then 2000: three quick searches, maxResults doubled, the last answer used', async () => {
      const connection = recordingConnection([
        answerOf(1000),
        answerOf(2000),
        answerOf(2500),
      ]);
      const { packages } = await resolvePackagePatterns(
        {
          sapAnswers: skipSapAnswers,
          searchObjects: createPackagePatternResolver({
            connection,
            logger: undefined,
          }),
        },
        ['Z*'],
      );
      expect(connection.requests.map(paramsOf)).toEqual([
        {
          path: '/sap/bc/adt/repository/informationsystem/search',
          query: 'Z*',
          maxResults: '1000',
        },
        {
          path: '/sap/bc/adt/repository/informationsystem/search',
          query: 'Z*',
          maxResults: '2000',
        },
        {
          path: '/sap/bc/adt/repository/informationsystem/search',
          query: 'Z*',
          maxResults: '4000',
        },
      ]);
      expect(packages).toHaveLength(2500);
    });

    it('a ? mask is sent as given', async () => {
      const connection = recordingConnection([answerOf(3)]);
      await resolvePackagePatterns(
        {
          sapAnswers: skipSapAnswers,
          searchObjects: createPackagePatternResolver({
            connection,
            logger: undefined,
          }),
        },
        ['Z?TEST'],
      );
      expect(connection.requests.map(paramsOf)).toEqual([
        {
          path: '/sap/bc/adt/repository/informationsystem/search',
          query: 'Z?TEST',
          maxResults: '1000',
        },
      ]);
    });

    it('an exact name with a literal _ sends no quick search', async () => {
      const connection = recordingConnection([]);
      const { packages } = await resolvePackagePatterns(
        {
          sapAnswers: skipSapAnswers,
          searchObjects: createPackagePatternResolver({
            connection,
            logger: undefined,
          }),
        },
        ['Z_PKG'],
      );
      expect(connection.requests).toEqual([]);
      expect(packages).toEqual(['Z_PKG']);
    });
  });
});

// ---------------------------------------------------------------------------
// D23b: a function module is its own scan object (DO18)
// ---------------------------------------------------------------------------

describe('D23b: a function module is its own scan object (DO18)', () => {
  const GG = '/sap/bc/adt/functions/groups/zfg';
  /**
   * `ZGRP` holds the function group `ZFG`: modules `Z_FM_A` (three hits) and
   * `Z_FM_B` (one), the function include `LZFGTOP` (one) and the include
   * `LZFGNOURI` (none).
   */
  const GROUP: Repository = {
    nodes: {
      [nodeKey('ZGRP')]: { types: [{ type: 'FUGR/F', nodeId: '000001' }] },
      [nodeKey('ZGRP', '1')]: { objects: [{ type: 'FUGR/F', name: 'ZFG' }] },
    },
    sources: {
      'FM Z_FM_A': 'marker a1\nmarker a2\nmarker a3',
      'FM Z_FM_B': 'marker b',
      'FINCLUDE ZFG/LZFGTOP': 'marker top',
      'INCLUDE LZFGNOURI': 'nothing here',
    },
    fugrChildren: {
      ZFG: [
        ['FUGR/FF', 'Z_FM_A', `${GG}/fmodules/z_fm_a`],
        ['FUGR/FF', 'Z_FM_B', `${GG}/fmodules/z_fm_b`],
        ['FUGR/I', 'LZFGTOP', `${GG}/includes/lzfgtop`],
        ['FUGR/I', 'LZFGNOURI'],
      ],
    },
    masks: {},
  };
  const searchGroup = (absent: boolean, args: Record<string, unknown> = {}) =>
    searchOn(
      standOn(GROUP),
      { query: 'marker', packages: ['ZGRP'], ...args },
      absent,
    );
  const PATHS2 = [['served'], ['absent']] as const;

  it.each(PATHS2)(
    "a hit in a function module is the module's object, with function_group_name (%s)",
    async (batch) => {
      const payload = payloadOf(await searchGroup(batch === 'absent'));
      const moduleB = payload.results.filter(
        (h: { object_name: string }) => h.object_name === 'Z_FM_B',
      );
      expect(moduleB).toEqual([
        {
          devclass: 'ZGRP',
          object_type: 'FUGR/FF',
          object_name: 'Z_FM_B',
          function_group_name: 'ZFG',
          line: 1,
          snippet: 'marker b',
        },
      ]);
      // Not listed under the group.
      expect(
        payload.results.some(
          (h: { object_name: string; include?: string }) =>
            h.object_name === 'ZFG' && h.include === 'Z_FM_B',
        ),
      ).toBe(false);
    },
  );

  it.each(PATHS2)(
    "a hit in a group include stays FUGR: the group's, with include (%s)",
    async (batch) => {
      const payload = payloadOf(await searchGroup(batch === 'absent'));
      expect(
        payload.results.filter(
          (h: { object_name: string }) => h.object_name === 'ZFG',
        ),
      ).toEqual([
        {
          devclass: 'ZGRP',
          object_type: 'FUGR',
          object_name: 'ZFG',
          include: 'LZFGTOP',
          line: 1,
          snippet: 'marker top',
        },
      ]);
    },
  );

  it.each(PATHS2)(
    'a group and its modules are counted as separate objects (%s)',
    async (batch) => {
      const payload = payloadOf(await searchGroup(batch === 'absent'));
      expect(payload.scanned).toEqual({
        packages: 1,
        objects: 3,
        sources: 4,
        objects_with_hits: 3,
      });
    },
  );

  it.each(PATHS2)(
    'each object has its own max_hits_per_object (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const capped = payloadOf(
        await searchGroup(absent, { max_hits_per_object: 2 }),
      );
      const counts = (payload: { results: Array<{ object_name: string }> }) => {
        const out: Record<string, number> = {};
        for (const h of payload.results) {
          out[h.object_name] = (out[h.object_name] ?? 0) + 1;
        }
        return out;
      };
      expect(counts(capped)).toEqual({ Z_FM_A: 2, Z_FM_B: 1, ZFG: 1 });
      expect(capped.truncated.by_object_cap).toBe(true);
      // No object passes 3 while their sum (5) does.
      const within = payloadOf(
        await searchGroup(absent, { max_hits_per_object: 3 }),
      );
      expect(counts(within)).toEqual({ Z_FM_A: 3, Z_FM_B: 1, ZFG: 1 });
      expect(within.truncated.by_object_cap).toBe(false);
    },
  );

  it.each(PATHS)(
    'each hit carries the arguments its read tool requires (%s)',
    async (batch) => {
      const payload = payloadOf(
        await searchAll(standOn(ALL), batch === 'absent'),
      );
      const LOCAL: Record<string, string> = {
        definitions: 'GetLocalDefinitions',
        implementations: 'GetLocalTypes',
        macros: 'GetLocalMacros',
        testclasses: 'GetLocalTestClass',
      };
      const checked: string[] = [];
      for (const hit of payload.results as Array<{
        object_type: string;
        object_name: string;
        include?: string;
        function_group_name?: string;
      }>) {
        let tool: string;
        let args: Record<string, unknown>;
        switch (hit.object_type) {
          case 'FUGR/FF':
            tool = 'GetFunctionModule';
            args = {
              function_module_name: hit.object_name,
              function_group_name: hit.function_group_name,
            };
            break;
          case 'FUGR':
            tool = 'GetFunctionInclude';
            args = {
              function_group_name: hit.object_name,
              include_name: hit.include,
            };
            break;
          case 'PROG':
            tool = hit.object_name === 'ZINCL' ? 'GetInclude' : 'GetProgram';
            args =
              tool === 'GetInclude'
                ? { include_name: hit.include }
                : { program_name: hit.object_name };
            break;
          case 'CLAS':
            tool =
              hit.include === hit.object_name
                ? 'GetClass'
                : (LOCAL[hit.include ?? ''] ?? 'none');
            args = { class_name: hit.object_name };
            break;
          case 'INTF':
            tool = 'GetInterface';
            args = { interface_name: hit.object_name };
            break;
          case 'DDLS':
            tool = 'GetDdl';
            args = { ddl_name: hit.object_name };
            break;
          case 'BDEF':
            tool = 'GetBehaviorDefinition';
            args = { behavior_definition_name: hit.object_name };
            break;
          case 'DDLX':
            tool = 'GetMetadataExtension';
            args = { metadata_extension_name: hit.object_name };
            break;
          case 'SRVD':
            tool = 'GetServiceDefinition';
            args = { service_definition_name: hit.object_name };
            break;
          default:
            throw new Error(`unexpected type ${hit.object_type}`);
        }
        const schema = READ_TOOLS[tool];
        expect({ tool, ok: schema?.safeParse(args).success }).toEqual({
          tool,
          ok: true,
        });
        checked.push(tool);
      }
      expect(new Set(checked)).toEqual(
        new Set([
          'GetFunctionModule',
          'GetFunctionInclude',
          'GetInclude',
          'GetProgram',
          'GetClass',
          'GetLocalDefinitions',
          'GetLocalTypes',
          'GetLocalMacros',
          'GetLocalTestClass',
          'GetInterface',
          'GetDdl',
          'GetBehaviorDefinition',
          'GetMetadataExtension',
          'GetServiceDefinition',
        ]),
      );
    },
  );
});

// ---------------------------------------------------------------------------
// D23b: the caller sets how much the answer holds (DO23)
// ---------------------------------------------------------------------------

describe('D23b: the caller sets how much the answer holds (DO23)', () => {
  /**
   * `ZLIM` holds a class `ZCL` (one hit in its main source, one in its local
   * definitions), a function group `ZFG` (one hit in its module `Z_FM`) and
   * programs `ZP1` (three hits), `ZP2` (two) and `ZP3` (one). In the scan's
   * order: ZCL, ZFG, ZP1, ZP2, ZP3.
   */
  const LIM: Repository = {
    nodes: {
      [nodeKey('ZLIM')]: {
        types: [
          { type: 'CLAS/OC', nodeId: '000001' },
          { type: 'FUGR/F', nodeId: '000002' },
          { type: 'PROG/P', nodeId: '000003' },
        ],
      },
      [nodeKey('ZLIM', '1')]: { objects: [{ type: 'CLAS/OC', name: 'ZCL' }] },
      [nodeKey('ZLIM', '2')]: { objects: [{ type: 'FUGR/F', name: 'ZFG' }] },
      [nodeKey('ZLIM', '3')]: {
        objects: [
          { type: 'PROG/P', name: 'ZP1' },
          { type: 'PROG/P', name: 'ZP2' },
          { type: 'PROG/P', name: 'ZP3' },
        ],
      },
    },
    sources: {
      'CLASS ZCL': 'marker main',
      'CLASSINCLUDE ZCL/DEFINITIONS': 'marker definitions',
      'FM Z_FM': 'marker module',
      'PROGRAM ZP1': 'marker 1\nmarker 2\nmarker 3',
      'PROGRAM ZP2': 'marker 1\nmarker 2',
      'PROGRAM ZP3': 'marker 1',
    },
    fugrChildren: { ZFG: [['FUGR/FF', 'Z_FM']] },
    masks: {},
  };
  const lim = (absent: boolean, args: Record<string, unknown> = {}) => {
    const fake = standOn(LIM);
    return {
      fake,
      result: searchOn(
        fake,
        { query: 'marker', packages: ['ZLIM'], ...args },
        absent,
      ),
    };
  };
  const sourceRequests = (fake: Fake) =>
    sentUrls(fake).filter(
      (url) =>
        !url.includes('/repository/nodestructure') &&
        !url.includes('/repository/objectstructure'),
    );
  const P = [['served'], ['absent']] as const;

  it('the schema offers answer, max_hits and max_hits_per_object; a wrong answer is refused', () => {
    const shape = TOOL_DEFINITION.inputSchema.shape;
    expect(Object.keys(shape)).toEqual(
      expect.arrayContaining(['answer', 'max_hits', 'max_hits_per_object']),
    );
    const ok = { query: 'x', packages: ['Z'] };
    for (const answer of ['objects', 'lines', 'snippets']) {
      expect(
        TOOL_DEFINITION.inputSchema.safeParse({ ...ok, answer }).success,
      ).toBe(true);
    }
    expect(
      TOOL_DEFINITION.inputSchema.safeParse({ ...ok, answer: 'words' }).success,
    ).toBe(false);
  });

  it.each(P)(
    'with no control the answer is the snippets level (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const plain = payloadOf(await lim(absent).result);
      const snippets = payloadOf(
        await lim(absent, { answer: 'snippets' }).result,
      );
      expect(snippets).toEqual(plain);
      expect(plain.results[0]).toEqual({
        devclass: 'ZLIM',
        object_type: 'CLAS',
        object_name: 'ZCL',
        include: 'ZCL',
        line: 1,
        snippet: 'marker main',
      });
      expect(plain.truncated).toEqual({ by_object_cap: false });
    },
  );

  it.each(P)(
    'answer objects names each object and include with its hit count (%s)',
    async (batch) => {
      const payload = payloadOf(
        await lim(batch === 'absent', { answer: 'objects' }).result,
      );
      expect(payload.results).toEqual([
        {
          devclass: 'ZLIM',
          object_type: 'CLAS',
          object_name: 'ZCL',
          include: 'ZCL',
          hits: 1,
        },
        {
          devclass: 'ZLIM',
          object_type: 'CLAS',
          object_name: 'ZCL',
          include: 'definitions',
          hits: 1,
        },
        {
          devclass: 'ZLIM',
          object_type: 'PROG',
          object_name: 'ZP1',
          include: 'ZP1',
          hits: 3,
        },
        {
          devclass: 'ZLIM',
          object_type: 'PROG',
          object_name: 'ZP2',
          include: 'ZP2',
          hits: 2,
        },
        {
          devclass: 'ZLIM',
          object_type: 'PROG',
          object_name: 'ZP3',
          include: 'ZP3',
          hits: 1,
        },
        {
          devclass: 'ZLIM',
          object_type: 'FUGR/FF',
          object_name: 'Z_FM',
          function_group_name: 'ZFG',
          hits: 1,
        },
      ]);
    },
  );

  it.each(P)(
    'answer lines carries line numbers and no snippets (%s)',
    async (batch) => {
      const payload = payloadOf(
        await lim(batch === 'absent', { answer: 'lines' }).result,
      );
      expect(payload.results[0]).toEqual({
        devclass: 'ZLIM',
        object_type: 'CLAS',
        object_name: 'ZCL',
        include: 'ZCL',
        line: 1,
      });
      expect(
        payload.results.some((h: { snippet?: string }) => 'snippet' in h),
      ).toBe(false);
      expect(payload.results).toHaveLength(9);
    },
  );

  it.each(P)(
    'max_hits stops reading; by_max_hits is set when anything is left (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const all = lim(absent);
      await all.result;
      const limited = lim(absent, { max_hits: 2 });
      const payload = payloadOf(await limited.result);
      // ZCL's main source and its definitions hold the two hits.
      expect(payload.results.map(hitLabel)).toEqual([
        'ZCL/ZCL',
        'ZCL/definitions',
      ]);
      expect(payload.truncated).toEqual({
        by_object_cap: false,
        by_max_hits: true,
      });
      if (absent) {
        expect(sourceRequests(limited.fake).length).toBeLessThan(
          sourceRequests(all.fake).length,
        );
      }
    },
  );

  it.each(P)(
    'max_hits exactly at the end leaves by_max_hits false (%s)',
    async (batch) => {
      const payload = payloadOf(
        await lim(batch === 'absent', { max_hits: 9 }).result,
      );
      expect(payload.results).toHaveLength(9);
      expect(payload.truncated).toEqual({
        by_object_cap: false,
        by_max_hits: false,
      });
    },
  );

  it.each(P)(
    'max_hits counts hits after max_hits_per_object (%s)',
    async (batch) => {
      const payload = payloadOf(
        await lim(batch === 'absent', {
          object_types: ['PROG'],
          max_hits_per_object: 1,
          max_hits: 2,
        }).result,
      );
      expect(payload.results.map(hitLabel)).toEqual(['ZP1/ZP1', 'ZP2/ZP2']);
      expect(payload.truncated).toEqual({
        by_object_cap: true,
        by_max_hits: true,
      });
    },
  );

  it.each(P)('objects counts only the hits answered (%s)', async (batch) => {
    const payload = payloadOf(
      await lim(batch === 'absent', {
        object_types: ['PROG'],
        answer: 'objects',
        max_hits_per_object: 2,
        max_hits: 3,
      }).result,
    );
    expect(
      payload.results.map(
        (e: { object_name: string; hits: number }) =>
          `${e.object_name}:${e.hits}`,
      ),
    ).toEqual(['ZP1:2', 'ZP2:1']);
  });

  it.each(P)(
    'the counters report what was done until the stop (%s)',
    async (batch) => {
      const absent = batch === 'absent';
      const payload = payloadOf(
        await lim(absent, { object_types: ['PROG'], max_hits: 3 }).result,
      );
      expect(payload.results).toHaveLength(3);
      // Sequential: ZP1 alone was read. Batched: the stopped chunk's
      // sources were read, ZP2 and ZP3 included.
      expect(payload.scanned).toEqual({
        packages: 1,
        objects: 1,
        sources: absent ? 1 : 3,
        objects_with_hits: 1,
      });
    },
  );

  it('the batched path stops at a chunk boundary: no envelope of a later chunk is sent', async () => {
    const names = Array.from(
      { length: 305 },
      (_, i) => `ZQ${String(i + 1).padStart(4, '0')}`,
    );
    const repo: Repository = {
      nodes: {
        [nodeKey('ZBIGL')]: { types: [{ type: 'PROG/P', nodeId: '000001' }] },
        [nodeKey('ZBIGL', '1')]: {
          objects: names.map((name) => ({ type: 'PROG/P', name })),
        },
      },
      sources: Object.fromEntries(
        names.map((name) => [`PROGRAM ${name}`, 'marker']),
      ),
      fugrChildren: {},
      masks: {},
    };
    const batched = standOn(repo);
    const sequential = standOn(repo);
    const args = { query: 'marker', packages: ['ZBIGL'], max_hits: 2 };
    const a = payloadOf(await searchOn(batched, args, false, 4000));
    const b = payloadOf(await searchOn(sequential, args, true, 4000));
    expect(sourceRequests(batched)).toHaveLength(300);
    expect(sourceRequests(sequential)).toHaveLength(2);
    expect(a.results).toEqual(b.results);
    expect(a.truncated).toEqual({ by_object_cap: false, by_max_hits: true });
    expect(b.truncated).toEqual(a.truncated);
    expect(a.scanned.sources).toBe(300);
    expect(b.scanned.sources).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// D23b: the fixed classification and the SAP-answer strategy (DO22)
// ---------------------------------------------------------------------------

describe('D23b: the fixed classification and the SAP-answer strategy (DO22)', () => {
  /** A strategy recording every SAP answer it is handed, answering `answer`. */
  const recordingSap = (
    answer: (place: SapAnswerPlace) => SapAnswerDecision = () => 'skip',
  ) => {
    const seen: SapAnswerPlace[] = [];
    const strategy: SapAnswerStrategy = {
      decide(_failure, place) {
        seen.push(place);
        return answer(place);
      },
    };
    return { strategy, seen };
  };

  /**
   * One scan meeting a SAP 500 at every place: the mask `ZM*`, the named
   * root `ZNOPE`, `ZPAR`'s subpackage `ZKB`, `ZTYP`'s type node 1, the
   * function group `ZFG`'s structure, the program `ZBADP`, and the include
   * `LSH` two function groups name.
   */
  const EVERY: Repository = {
    nodes: {
      [nodeKey('ZPAR')]: {
        types: [
          { type: 'DEVC/K', nodeId: '000001' },
          { type: 'PROG/P', nodeId: '000002' },
          { type: 'FUGR/F', nodeId: '000003' },
        ],
      },
      [nodeKey('ZPAR', '1')]: { objects: [{ type: 'DEVC/K', name: 'ZKB' }] },
      [nodeKey('ZPAR', '2')]: {
        objects: [
          { type: 'PROG/P', name: 'ZBADP' },
          { type: 'PROG/P', name: 'ZGOODP' },
        ],
      },
      [nodeKey('ZPAR', '3')]: {
        objects: [
          { type: 'FUGR/F', name: 'ZFG' },
          { type: 'FUGR/F', name: 'ZFG1' },
          { type: 'FUGR/F', name: 'ZFG2' },
        ],
      },
      [nodeKey('ZTYP')]: {
        types: [
          { type: 'PROG/P', nodeId: '000001' },
          { type: 'CLAS/OC', nodeId: '000002' },
        ],
      },
      [nodeKey('ZTYP', '2')]: { objects: [{ type: 'CLAS/OC', name: 'ZTCL' }] },
    },
    sources: {
      'PROGRAM ZGOODP': 'marker good',
      'CLASS ZTCL': 'marker class',
    },
    fugrChildren: {
      ZFG1: [['FUGR/I', 'LSH']],
      ZFG2: [['FUGR/I', 'LSH']],
    },
    masks: { 'ZM*': ['ZPAR'] },
  };
  const EVERY_REFUSED: Model = {
    refuse: {
      'SEARCH ZM*': 500,
      [nodeKey('ZNOPE')]: 500,
      [nodeKey('ZKB')]: 500,
      [nodeKey('ZTYP', '1')]: 500,
      'STRUCTURE ZFG': 500,
      'PROGRAM ZBADP': 500,
      'INCLUDE LSH': 500,
    },
  };
  const ARGS = {
    query: 'marker',
    packages: ['ZM*', 'ZNOPE', 'ZPAR', 'ZTYP'],
  };
  /** `EVERY` with every place readable: only a refused key fails. */
  const EVERY_OK: Repository = {
    ...EVERY,
    nodes: {
      ...EVERY.nodes,
      [nodeKey('ZNOPE')]: {},
      [nodeKey('ZKB')]: {},
      [nodeKey('ZTYP', '1')]: { objects: [] },
    },
    sources: {
      ...EVERY.sources,
      'PROGRAM ZBADP': 'marker',
      'INCLUDE LSH': 'marker',
    },
  };
  const run = (
    fake: Fake,
    absent: boolean,
    sapAnswers: SapAnswerStrategy,
    args: OrchestratorInput = ARGS,
  ) =>
    runSearchSourceWithContext(
      contextOn(fake, absent ? 'absent' : 'served'),
      args,
      { lineMatch: substringLineMatch, sapAnswers },
    );
  const P = [['served'], ['absent']] as const;

  it.each(P)(
    'a recording strategy sees exactly one call per SAP answer, each with its place (%s)',
    async (batch) => {
      const { strategy, seen } = recordingSap();
      const result = await run(
        standOn(EVERY, EVERY_REFUSED),
        batch === 'absent',
        strategy,
      );
      const byKind = (kind: SapAnswerPlace['kind']) =>
        seen.filter((p) => p.kind === kind);
      expect(byKind('mask')).toEqual([{ kind: 'mask', mask: 'ZM*' }]);
      expect(byKind('package')).toEqual([
        { kind: 'package', package: 'ZNOPE' },
      ]);
      expect(byKind('level')).toEqual(
        expect.arrayContaining([
          { kind: 'level', package: 'ZPAR', level: { subpackage: 'ZKB' } },
          {
            kind: 'level',
            package: 'ZTYP',
            level: { node: { id: '1', type: 'PROG/P' } },
          },
        ]),
      );
      expect(byKind('level')).toHaveLength(2);
      expect(byKind('structure')).toEqual([
        {
          kind: 'structure',
          group: 'ZFG',
          uri: '/sap/bc/adt/functions/groups/zfg',
        },
      ]);
      // ZBADP once; LSH once, though two groups name it.
      expect(byKind('source')).toHaveLength(2);
      expect(byKind('source')).toEqual(
        expect.arrayContaining([
          {
            kind: 'source',
            devclass: 'ZPAR',
            object_type: 'FUGR',
            object_name: 'ZFG1',
            source: {
              name: 'LSH',
              uri: '/sap/bc/adt/programs/includes/lsh/source/main',
              key: '/sap/bc/adt/programs/includes/lsh/source/main|active',
            },
          },
          {
            kind: 'source',
            devclass: 'ZPAR',
            object_type: 'PROG',
            object_name: 'ZBADP',
            source: {
              name: 'ZBADP',
              uri: '/sap/bc/adt/programs/programs/zbadp/source/main',
              key: '/sap/bc/adt/programs/programs/zbadp/source/main|active',
            },
          },
        ]),
      );
      expect(seen).toHaveLength(7);
      // Every SAP answer skipped: the readable ones answer.
      expect(result.results.map(hitLabel).sort()).toEqual([
        'ZGOODP/ZGOODP',
        'ZTCL/ZTCL',
      ]);
    },
  );

  it.each([
    ['served', 'level'],
    ['absent', 'level'],
    ['served', 'structure'],
    ['absent', 'structure'],
    ['served', 'source'],
    ['absent', 'source'],
  ] as const)(
    "a strategy's throw for a SAP answer is thrown out of the call (%s, at the %s)",
    async (batch, kind) => {
      const { strategy } = recordingSap((place) =>
        place.kind === kind ? 'throw' : 'skip',
      );
      await expect(
        run(standOn(EVERY, EVERY_REFUSED), batch === 'absent', strategy),
      ).rejects.toBeDefined();
    },
  );

  it.each(P)(
    "a strategy's end ends the call, its skip skips, from each place (%s)",
    async (batch) => {
      for (const kind of [
        'mask',
        'package',
        'level',
        'structure',
        'source',
      ] as const) {
        const ending = recordingSap((place) =>
          place.kind === kind ? 'end' : 'skip',
        );
        await expect(
          run(
            standOn(EVERY, EVERY_REFUSED),
            batch === 'absent',
            ending.strategy,
          ),
        ).rejects.toBeDefined();
      }
      const skipping = recordingSap(() => 'skip');
      await expect(
        run(
          standOn(EVERY, EVERY_REFUSED),
          batch === 'absent',
          skipping.strategy,
        ),
      ).resolves.toBeDefined();
    },
  );

  it.each([
    ['served', 'SEARCH ZM*'],
    ['absent', 'SEARCH ZM*'],
    ['served', nodeKey('ZNOPE')],
    ['absent', nodeKey('ZNOPE')],
    ['served', nodeKey('ZKB')],
    ['absent', nodeKey('ZKB')],
    ['served', nodeKey('ZTYP', '1')],
    ['absent', nodeKey('ZTYP', '1')],
    ['served', 'STRUCTURE ZFG'],
    ['absent', 'STRUCTURE ZFG'],
    ['served', 'PROGRAM ZBADP'],
    ['absent', 'PROGRAM ZBADP'],
  ] as const)(
    'an answered 401 ends the call, never handed to the strategy (%s, %s)',
    async (batch, key) => {
      const { strategy, seen } = recordingSap();
      await expect(
        run(
          standOn(EVERY_OK, { refuse: { [key]: 401 } }),
          batch === 'absent',
          strategy,
        ),
      ).rejects.toBeDefined();
      expect(seen).toEqual([]);
    },
  );

  it('a failure with no response is thrown, never handed to the strategy (absent)', async () => {
    const { strategy, seen } = recordingSap();
    const fake = standOn(EVERY_OK, {
      throwOn: { 'PROGRAM ZBADP': 'socket hang up' },
    });
    await expect(run(fake, true, strategy)).rejects.toBeDefined();
    expect(seen).toEqual([]);
  });

  describe('what the classification hands over, at a source and a structure (sequential deps)', () => {
    const PROG: PackageContentItem = {
      name: 'ZP',
      type: 'PROG/P',
      packageName: 'ZPKG',
      isPackage: false,
    };
    const GROUP: PackageContentItem = {
      name: 'ZG',
      type: 'FUGR/F',
      packageName: 'ZPKG',
      isPackage: false,
    };
    const refusalError = (status?: number): IAdtError => ({
      message: 'refused',
      origin: status === undefined ? 'refusal' : 'connection',
      ...(status !== undefined
        ? {
            response: {
              status,
              statusText: 'x',
              headers: {},
              data: '',
            },
          }
        : {}),
    });
    type Failing = { thrown: unknown } | { answered: IAdtError };
    const scanWith = async (
      failing: Failing,
      sapAnswers: SapAnswerStrategy,
      at: 'source' | 'structure',
    ) =>
      runSearchSource(
        {
          lineMatch: substringLineMatch,
          sapAnswers,
          fetchPackageContents: async (name) =>
            listing(name, [at === 'source' ? PROG : GROUP]),
          sourceReader: {
            async readSource() {
              if ('thrown' in failing) throw failing.thrown;
              return { ok: false, error: failing.answered };
            },
            async readStructure() {
              if (at === 'source') return { ok: true, value: [] };
              if ('thrown' in failing) throw failing.thrown;
              return { ok: false, error: failing.answered };
            },
          },
          resolvePackages: exactPackages,
        },
        { query: 'marker', packages: ['ZPKG'] },
      );
    // Each case builds its failure afresh, as every SAP answer is a new object.
    const SAP_ANSWERS: Array<[string, () => Failing]> = [
      [
        'an answered 500 of origin connection with a response',
        () => ({ answered: refusalError(500) }),
      ],
      [
        'an answered 404 of origin connection with a response',
        () => ({ answered: refusalError(404) }),
      ],
      [
        'an origin refusal failure without a response',
        () => ({ answered: refusalError() }),
      ],
      [
        'a carried ADT failure with a response',
        () => ({
          thrown: carryingFailure(
            new Error('carried'),
            refusalError(500),
            'read program',
          ),
        }),
      ],
      [
        'a raw transport failure with a response and a status',
        () => ({
          thrown: Object.assign(new Error('raw'), {
            response: { status: 503 },
          }),
        }),
      ],
    ];
    it.each(
      SAP_ANSWERS.flatMap(([name, failing]) => [
        [name, 'source', failing] as const,
        [name, 'structure', failing] as const,
      ]),
    )(
      '%s is handed to the strategy and skipped by the shipped one (at the %s)',
      async (_name, at, failing) => {
        const { strategy, seen } = recordingSap();
        await scanWith(failing(), strategy, at);
        expect(seen.map((p) => p.kind)).toEqual([at]);
        await expect(
          scanWith(failing(), skipSapAnswers, at),
        ).resolves.toBeDefined();
      },
    );

    const NEVER: Array<[string, () => unknown]> = [
      ['a TypeError', () => new TypeError('a defect')],
      ['a RangeError', () => new RangeError('a defect')],
      ['a thrown primitive', () => 'a primitive'],
      [
        'a failure with no response and origin connection',
        () =>
          carryingFailure(
            new Error('down'),
            { message: 'down', origin: 'connection' },
            'read program',
          ),
      ],
      [
        'a credential refusal',
        () =>
          new AuthRefusedError(
            authError['credential-refused']({ credential: 'token' }),
            'request',
          ),
      ],
      [
        'an answered 401',
        () =>
          carryingFailure(new Error('401'), refusalError(401), 'read program'),
      ],
    ];
    it.each(
      NEVER.flatMap(([name, thrown]) => [
        [name, 'source', thrown] as const,
        [name, 'structure', thrown] as const,
      ]),
    )(
      '%s is never handed to the strategy (at the %s): the call fails with it',
      async (_name, at, make) => {
        const thrown = make();
        const { strategy, seen } = recordingSap();
        const rejected = expect(scanWith({ thrown }, strategy, at)).rejects;
        if (typeof thrown === 'string') await rejected.toBeDefined();
        else await rejected.toBe(thrown);
        expect(seen).toEqual([]);
      },
    );

    it('a thrown primitive leaves the handler as the same primitive', async () => {
      const decided = expect(
        scanWith({ thrown: 'a primitive' }, skipSapAnswers, 'source'),
      ).rejects;
      await decided.toBeDefined();
      try {
        await scanWith({ thrown: 'a primitive' }, skipSapAnswers, 'source');
      } catch (carried) {
        expect(undecided(carried)).toBe('a primitive');
      }
    });
  });

  describe('envelopes (batched path), through the real client conversion', () => {
    /** The stand, its envelope failing with `error` when a part's key starts with `prefix`. */
    const failingEnvelope = (prefix: string, error: () => never) =>
      standOn(
        EVERY_OK,
        {},
        {
          envelope: (parts) => {
            if (parts.some((p) => keyOf(p.url).startsWith(prefix))) error();
            return undefined as never;
          },
        },
      );
    it.each([
      ['a mask-search phase', 'SEARCH '],
      ['a walk-level phase', 'NODE '],
      ['a structure-and-source phase', 'STRUCTURE '],
    ])(
      'any other envelope failure is thrown, never handed to the strategy: %s',
      async (_name, prefix) => {
        const { strategy, seen } = recordingSap();
        await expect(
          run(
            failingEnvelope(prefix, () => {
              throw statusError(500, 'Internal Server Error');
            }),
            false,
            strategy,
          ),
        ).rejects.toBeDefined();
        expect(seen).toEqual([]);
      },
    );

    it("a credential refusal as the envelope's error ends the call", async () => {
      const { strategy, seen } = recordingSap();
      await expect(
        run(
          failingEnvelope('NODE ', () => {
            throw new AuthRefusedError(
              authError['credential-refused']({ credential: 'token' }),
              'request',
            );
          }),
          false,
          strategy,
        ),
      ).rejects.toBeDefined();
      expect(seen).toEqual([]);
    });

    it('an envelope answered with the outer 404 is no failure: the sequential fallback reads the same parts', async () => {
      const { strategy, seen } = recordingSap();
      const fake = standOn(
        EVERY_OK,
        {},
        {
          envelope: () => {
            throw statusError(404, 'Not Found');
          },
        },
      );
      const result = await run(fake, false, strategy);
      expect(fake.envelopes).toHaveLength(1);
      expect(fake.directs.length).toBeGreaterThan(0);
      expect(result.results.length).toBeGreaterThan(0);
      expect(seen).toEqual([]);
    });
  });

  it('the classification lives in one module: no other search-source module reads a credential failure', () => {
    const dir = path.join(__dirname, '../../../lib/search-source');
    for (const file of fs.readdirSync(dir)) {
      if (file === 'readFailure.ts') continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect({
        file,
        reads:
          text.includes('isCredentialFailure') || text.includes('endsTheCall'),
      }).toEqual({ file, reads: false });
    }
  });
});
