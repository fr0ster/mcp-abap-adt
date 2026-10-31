import type { EnumeratedObject } from '../../../lib/search-source/packageEnumerator';
import {
  createSourceReaderDeps,
  type FugrChild,
  type ReadSourceUnitsDeps,
  readSourceUnits,
  type SourceUnit,
} from '../../../lib/search-source/sourceReader';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

function makeDeps(overrides: Partial<ReadSourceUnitsDeps> = {}): {
  deps: ReadSourceUnitsDeps;
  calls: {
    programs: string[];
    includes: string[];
    classes: string[];
    fms: string[];
  };
} {
  const calls = {
    programs: [] as string[],
    includes: [] as string[],
    classes: [] as string[],
    fms: [] as string[],
  };
  const deps: ReadSourceUnitsDeps = {
    async readProgram(name, _v) {
      calls.programs.push(name);
      return `program-${name}\nline2`;
    },
    async readInclude(name) {
      calls.includes.push(name);
      return `include-${name}\nline2`;
    },
    async readClassMain(name, _v) {
      calls.classes.push(name);
      return `class-${name}-main`;
    },
    async fetchFugrStructure(_name) {
      return [];
    },
    async readFugrFm(_fg, fm) {
      calls.fms.push(fm);
      return `fm-${fm}-body`;
    },
    ...overrides,
  };
  return { deps, calls };
}

async function collect(gen: AsyncGenerator<SourceUnit>): Promise<SourceUnit[]> {
  const out: SourceUnit[] = [];
  for await (const u of gen) out.push(u);
  return out;
}

const PROG: EnumeratedObject = {
  devclass: 'ZPKG',
  object_type: 'PROG',
  object_name: 'Z_PROG',
};
const CLAS: EnumeratedObject = {
  devclass: 'ZPKG',
  object_type: 'CLAS',
  object_name: 'Z_CLAS',
};
const FUGR: EnumeratedObject = {
  devclass: 'ZPKG',
  object_type: 'FUGR',
  object_name: 'Z_FG',
};

describe('readSourceUnits', () => {
  it('PROG yields a single source unit named after the program', async () => {
    const { deps, calls } = makeDeps();
    const units = await collect(readSourceUnits(deps, PROG));
    expect(units).toHaveLength(1);
    expect(units[0].include).toBe('Z_PROG');
    expect(units[0].lines).toEqual(['program-Z_PROG', 'line2']);
    expect(calls.programs).toEqual(['Z_PROG']);
  });

  it('FUGR yields one unit per child (FM + REPO-style includes), VIEW* FMs dropped, deterministic order', async () => {
    const children: FugrChild[] = [
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
    const { deps, calls } = makeDeps({
      async fetchFugrStructure(_) {
        return children;
      },
    });
    const units = await collect(readSourceUnits(deps, FUGR));
    expect(units.map((u) => u.include)).toEqual([
      'Z_FM_A',
      'Z_FM_B',
      'LZ_FGF01',
    ]);
    expect(calls.fms).toEqual(['Z_FM_A', 'Z_FM_B']);
    expect(calls.includes).toEqual(['LZ_FGF01']);
  });

  it('FUGR reads what objecturi points at: one read per include, none for a screen, GUI status or title', async () => {
    const G = '/sap/bc/adt/functions/groups/z_fg';
    const VIT = '/sap/bc/adt/vit/wb/object_type';
    const children: FugrChild[] = [
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
    const { deps, calls } = makeDeps({
      async fetchFugrStructure(_) {
        return children;
      },
    });
    const units = await collect(readSourceUnits(deps, FUGR));
    expect(calls.fms).toEqual(['Z_FM_A']);
    expect(calls.includes).toEqual(['LZ_FGF01', 'LZ_FGO01', 'LZ_FGTOP']);
    expect(units.map((u) => u.include)).toEqual([
      'Z_FM_A',
      'LZ_FGF01',
      'LZ_FGO01',
      'LZ_FGTOP',
    ]);
  });

  it('FUGR without objecturi reads FUGR/FF as function modules and FUGR/I as includes, nothing else', async () => {
    const children: FugrChild[] = [
      { objecttype: 'FUGR/I', objectname: 'LZ_FGTOP' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      { objecttype: 'FUGR/PD', objectname: 'LZ_FGTOP' },
      {
        objecttype: 'FUGR/PS',
        objectname: 'SAPLZ_FG                                0100',
      },
    ];
    const { deps, calls } = makeDeps({
      async fetchFugrStructure(_) {
        return children;
      },
    });
    await collect(readSourceUnits(deps, FUGR));
    expect(calls.fms).toEqual(['Z_FM_A']);
    expect(calls.includes).toEqual(['LZ_FGTOP']);
  });

  it('the structure is read through the objectStructure strategy: every FUGR node with its objecturi', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer">
<projectexplorer:node nodeid="000053" parentid="000052" isfolder="false" objecttype="FUGR/PS" objectname="SAPLZ_FG                                0100" objecturi="/sap/bc/adt/vit/wb/object_type/fugrps/object_name/SAPLZ_FG%20%200100"/>
<projectexplorer:node nodeid="000060" parentid="000059" isfolder="false" objecttype="FUGR/I" objectname="LZ_FGF01" objecturi="/sap/bc/adt/functions/groups/z_fg/includes/lz_fgf01"/>
<projectexplorer:node nodeid="000070" parentid="000069" isfolder="false" objecttype="PROG/PX" objectname="SAPLZ_FG"/>
</projectexplorer:objectstructure>`;
    const asked: string[] = [];
    const connection = {
      async makeAdtRequest(req: { url: string }) {
        asked.push(req.url);
        return { status: 200, statusText: 'OK', headers: {}, data: xml };
      },
    };
    const deps = createSourceReaderDeps({
      connection,
      logger: undefined,
    } as any);
    expect(await deps.fetchFugrStructure('Z_FG')).toEqual([
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
    ]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('/sap/bc/adt/repository/objectstructure');
  });

  it('CLAS yields the class main include only (no subincludes in v1)', async () => {
    const { deps, calls } = makeDeps();
    const units = await collect(readSourceUnits(deps, CLAS));
    expect(units.map((u) => u.include)).toEqual(['Z_CLAS']);
    expect(calls.classes).toEqual(['Z_CLAS']);
  });

  it('skips a unit whose source read fails, logs debug, continues with the rest', async () => {
    const children: FugrChild[] = [
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_B' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_C' },
    ];
    const debugMsgs: string[] = [];
    const { deps } = makeDeps({
      async fetchFugrStructure(_) {
        return children;
      },
      async readFugrFm(_fg, fm) {
        if (fm === 'Z_FM_B') throw new Error('boom');
        return `fm-${fm}`;
      },
      logger: { debug: (m) => debugMsgs.push(m) },
    });
    const units = await collect(readSourceUnits(deps, FUGR));
    expect(units.map((u) => u.include)).toEqual(['Z_FM_A', 'Z_FM_C']);
    expect(debugMsgs.some((m) => m.includes('Z_FM_B'))).toBe(true);
  });

  it('lazy iteration: aborting after the first FUGR unit prevents later fetches', async () => {
    const children: FugrChild[] = [
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_A' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_B' },
      { objecttype: 'FUGR/FF', objectname: 'Z_FM_C' },
    ];
    const { deps, calls } = makeDeps({
      async fetchFugrStructure(_) {
        return children;
      },
    });
    const gen = readSourceUnits(deps, FUGR);
    const first = await gen.next();
    expect(first.done).toBe(false);
    await gen.return(undefined as unknown as SourceUnit);
    expect(calls.fms).toEqual(['Z_FM_A']);
  });
});
