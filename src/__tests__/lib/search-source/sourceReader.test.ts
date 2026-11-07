import type { EnumeratedObject } from '../../../lib/search-source/packageEnumerator';
import {
  createSourceReaderDeps,
  type FugrChild,
  type ReadSourceUnitsDeps,
  readSourceUnits,
  type SourceUnit,
} from '../../../lib/search-source/sourceReader';
import { recordingConnection } from '../../helpers/recordingConnection';
import { fakeKeyOf, sapAnswered } from '../../helpers/sourceReaderFake';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

function makeDeps(
  overrides: {
    structure?: FugrChild[];
    failing?: string;
    absent?: string;
  } = {},
): { deps: ReadSourceUnitsDeps; calls: string[] } {
  const calls: string[] = [];
  const deps: ReadSourceUnitsDeps = {
    async readSource(read) {
      const key = fakeKeyOf(read);
      calls.push(key);
      if (key === overrides.failing) throw new Error('boom');
      if (key === overrides.absent)
        return { ok: false, error: sapAnswered(404) };
      return { ok: true, value: `${key}\nline2` };
    },
    async readStructure() {
      return { ok: true, value: overrides.structure ?? [] };
    },
  };
  return { deps, calls };
}

async function collect(gen: AsyncGenerator<SourceUnit>): Promise<SourceUnit[]> {
  const out: SourceUnit[] = [];
  for await (const u of gen) out.push(u);
  return out;
}

const includes = (units: SourceUnit[]) => units.map((u) => u.include);

const PROG: EnumeratedObject = {
  devclass: 'ZPKG',
  object_type: 'PROG',
  object_name: 'Z_PROG',
  code: 'PROG/P',
};
const CLAS: EnumeratedObject = {
  devclass: 'ZPKG',
  object_type: 'CLAS',
  object_name: 'Z_CLAS',
  code: 'CLAS/OC',
};
const FUGR: EnumeratedObject = {
  devclass: 'ZPKG',
  object_type: 'FUGR',
  object_name: 'Z_FG',
  code: 'FUGR/F',
};

describe('readSourceUnits', () => {
  it('PROG yields a single source unit named after the program', async () => {
    const { deps, calls } = makeDeps();
    const units = await collect(readSourceUnits(deps, PROG));
    expect(units).toEqual([
      {
        include: 'Z_PROG',
        lines: ['PROG:Z_PROG', 'line2'],
        source: '/sap/bc/adt/programs/programs/z_prog/source/main|active',
        module: undefined,
      },
    ]);
    expect(calls).toEqual(['PROG:Z_PROG']);
  });

  it('FUGR yields one unit per child, VIEW* modules included, function modules first, each by name', async () => {
    const structure: FugrChild[] = [
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_B' },
      { objecttype: 'FUGR/FF', objectname: 'VIEW_DIALOG_GEN' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      {
        objecttype: 'FUGR/PU',
        objectname: 'LZ_FGF01',
        objecturi:
          '/sap/bc/adt/functions/groups/z_fg/includes/lz_fgf01/source/main#start=3,1',
      },
    ];
    const { deps, calls } = makeDeps({ structure });
    const units = await collect(readSourceUnits(deps, FUGR));
    expect(includes(units)).toEqual([
      'VIEW_DIALOG_GEN',
      'Z_FM_A',
      'Z_FM_B',
      'LZ_FGF01',
    ]);
    expect(calls).toEqual([
      'FM:Z_FG/VIEW_DIALOG_GEN',
      'FM:Z_FG/Z_FM_A',
      'FM:Z_FG/Z_FM_B',
      'FINC:Z_FG/LZ_FGF01',
    ]);
  });

  it('FUGR reads what objecturi points at: one read per include, through its reader; none for a screen, GUI status or title', async () => {
    const G = '/sap/bc/adt/functions/groups/z_fg';
    const VIT = '/sap/bc/adt/vit/wb/object_type';
    const structure: FugrChild[] = [
      {
        objecttype: 'FUGR/FF',
        objectname: 'Z_FM_A',
        objecturi: `${G}/fmodules/z_fm_a`,
      },
      {
        objecttype: 'FUGR/I',
        objectname: 'LZ_FGTOP',
        objecturi: `${G}/includes/lz_fgtop`,
      },
      {
        objecttype: 'FUGR/I',
        objectname: 'LZ_FGF01',
        objecturi: `${G}/includes/lz_fgf01`,
      },
      {
        objecttype: 'FUGR/PD',
        objectname: 'LZ_FGTOP',
        objecturi: `${G}/includes/lz_fgtop/source/main#start=4,2`,
      },
      {
        objecttype: 'FUGR/PO',
        objectname: 'LZ_FGO01',
        objecturi: `${G}/includes/lz_fgo01/source/main#start=1,7`,
      },
      {
        objecttype: 'FUGR/I',
        objectname: 'LSVIMFXX',
        objecturi: '/sap/bc/adt/programs/includes/lsvimfxx',
      },
      {
        objecttype: 'FUGR/PS',
        objectname: 'SAPLZ_FG                                0100',
        objecturi: `${VIT}/fugrps/object_name/SAPLZ_FG%20%200100`,
      },
      {
        objecttype: 'FUGR/PC',
        objectname: 'SAPLZ_FG',
        objecturi: `${VIT}/fugrpc/object_name/SAPLZ_FG%20%20MAIN`,
      },
      {
        objecttype: 'FUGR/PZ',
        objectname: 'SAPLZ_FG',
        objecturi: `${VIT}/fugrpz/object_name/SAPLZ_FG%20%200100`,
      },
    ];
    const { deps, calls } = makeDeps({ structure });
    const units = await collect(readSourceUnits(deps, FUGR));
    expect(calls).toEqual([
      'FM:Z_FG/Z_FM_A',
      'INC:LSVIMFXX',
      'FINC:Z_FG/LZ_FGF01',
      'FINC:Z_FG/LZ_FGO01',
      'FINC:Z_FG/LZ_FGTOP',
    ]);
    expect(includes(units)).toEqual([
      'Z_FM_A',
      'LSVIMFXX',
      'LZ_FGF01',
      'LZ_FGO01',
      'LZ_FGTOP',
    ]);
  });

  it('FUGR without objecturi reads FUGR/FF as function modules and FUGR/I as includes, nothing else', async () => {
    const structure: FugrChild[] = [
      { objecttype: 'FUGR/I', objectname: 'LZ_FGTOP' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      { objecttype: 'FUGR/PD', objectname: 'LZ_FGTOP' },
      {
        objecttype: 'FUGR/PS',
        objectname: 'SAPLZ_FG                                0100',
      },
    ];
    const { deps, calls } = makeDeps({ structure });
    await collect(readSourceUnits(deps, FUGR));
    expect(calls).toEqual(['FM:Z_FG/Z_FM_A', 'INC:LZ_FGTOP']);
  });

  it('the structure is read through the objectStructure strategy: every FUGR node with its objecturi', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">
<projectexplorer:node nodeid="000053" parentid="000052" isfolder="false" objecttype="FUGR/PS" objectname="SAPLZ_FG                                0100" objecturi="/sap/bc/adt/vit/wb/object_type/fugrps/object_name/SAPLZ_FG%20%200100"/>
<projectexplorer:node nodeid="000060" parentid="000059" isfolder="false" objecttype="FUGR/I" objectname="LZ_FGF01" objecturi="/sap/bc/adt/functions/groups/z_fg/includes/lz_fgf01"/>
<projectexplorer:node nodeid="000070" parentid="000069" isfolder="false" objecttype="PROG/PX" objectname="SAPLZ_FG"/>
</projectexplorer:objectstructure>`;
    const connection = recordingConnection([{ data: xml }]);
    const deps = createSourceReaderDeps({ connection, logger: undefined });
    expect(await deps.readStructure('Z_FG')).toEqual({
      ok: true,
      value: [
        {
          objecttype: 'FUGR/PS',
          objectname: 'SAPLZ_FG                                0100',
          objecturi:
            '/sap/bc/adt/vit/wb/object_type/fugrps/object_name/SAPLZ_FG%20%200100',
        },
        {
          objecttype: 'FUGR/I',
          objectname: 'LZ_FGF01',
          objecturi: '/sap/bc/adt/functions/groups/z_fg/includes/lz_fgf01',
        },
      ],
    });
    expect(connection.requests).toHaveLength(1);
    expect(connection.requests[0]?.url).toContain(
      '/sap/bc/adt/repository/objectstructure',
    );
  });

  it('CLAS yields the main source and the four local includes; a local include SAP answers 404 is absent', async () => {
    const { deps, calls } = makeDeps({ absent: 'CLASINC:Z_CLAS/macros' });
    const units = await collect(readSourceUnits(deps, CLAS));
    expect(includes(units)).toEqual([
      'Z_CLAS',
      'definitions',
      'implementations',
      'testclasses',
    ]);
    expect(calls).toEqual([
      'CLAS:Z_CLAS',
      'CLASINC:Z_CLAS/definitions',
      'CLASINC:Z_CLAS/implementations',
      'CLASINC:Z_CLAS/macros',
      'CLASINC:Z_CLAS/testclasses',
    ]);
  });

  it('a class main source SAP answers 404 is skipped; the four local includes are still read', async () => {
    const { deps, calls } = makeDeps({ absent: 'CLAS:Z_CLAS' });
    const units = await collect(readSourceUnits(deps, CLAS));
    expect(includes(units)).toEqual([
      'definitions',
      'implementations',
      'macros',
      'testclasses',
    ]);
    expect(calls).toHaveLength(5);
  });

  it('a unit whose read throws is skipped; the reads go on with the rest', async () => {
    const structure: FugrChild[] = [
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_B' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_C' },
    ];
    const { deps, calls } = makeDeps({ structure, failing: 'FM:Z_FG/Z_FM_B' });
    const units = await collect(readSourceUnits(deps, FUGR));
    expect(units).toEqual([
      {
        include: 'Z_FM_A',
        lines: ['FM:Z_FG/Z_FM_A', 'line2'],
        source:
          '/sap/bc/adt/functions/groups/z_fg/fmodules/z_fm_a/source/main|active',
        module: { name: 'Z_FM_A', group: 'Z_FG' },
      },
      {
        include: 'Z_FM_C',
        lines: ['FM:Z_FG/Z_FM_C', 'line2'],
        source:
          '/sap/bc/adt/functions/groups/z_fg/fmodules/z_fm_c/source/main|active',
        module: { name: 'Z_FM_C', group: 'Z_FG' },
      },
    ]);
    expect(calls).toEqual([
      'FM:Z_FG/Z_FM_A',
      'FM:Z_FG/Z_FM_B',
      'FM:Z_FG/Z_FM_C',
    ]);
  });

  it('a function group whose structure SAP refuses yields nothing', async () => {
    const deps: ReadSourceUnitsDeps = {
      async readSource() {
        throw new Error('no source is read without the structure');
      },
      async readStructure() {
        return { ok: false, error: sapAnswered(500) };
      },
    };
    expect(await collect(readSourceUnits(deps, FUGR))).toEqual([]);
  });

  it('a credential failure SAP answered ends the reads, thrown', async () => {
    const deps: ReadSourceUnitsDeps = {
      async readSource() {
        return { ok: false, error: sapAnswered(401) };
      },
      async readStructure() {
        return { ok: true, value: [] };
      },
    };
    await expect(collect(readSourceUnits(deps, PROG))).rejects.toBeDefined();
  });

  it('lazy iteration: aborting after the first FUGR unit prevents later fetches', async () => {
    const structure: FugrChild[] = [
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_B' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_C' },
    ];
    const { deps, calls } = makeDeps({ structure });
    const gen = readSourceUnits(deps, FUGR);
    const first = await gen.next();
    expect(first.done).toBe(false);
    await gen.return(undefined);
    expect(calls).toEqual(['FM:Z_FG/Z_FM_A']);
  });
});
