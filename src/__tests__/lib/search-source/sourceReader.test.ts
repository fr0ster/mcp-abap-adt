import type { EnumeratedObject } from '../../../lib/search-source/packageEnumerator';
import {
  type FugrChild,
  type ReadSourceUnitsDeps,
  readSourceUnits,
  type SourceUnit,
} from '../../../lib/search-source/sourceReader';

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
      { objecttype: 'FUGR/PU', objectname: 'LZ_FGF01' },
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
