/**
 * The branch rule of a walk (DO19, `SearchSource` only): under it, a refused
 * or missing level below the asked package's root — a type node, a
 * subpackage — excludes only that branch, and every package whose own level
 * was read is recorded; the root and every level are handed to the caller
 * at their place (DO22); a credential
 * refusal ends the walk. Without it (every other walking tool), a refused
 * level ends the package's walk as before. Both walkers: `walkPackage`
 * (sequential) and `walkPackages` (level by level).
 */
import type { PhaseResult } from '../../lib/batch/phases';
import {
  failedRead,
  skipSapAnswers,
} from '../../lib/search-source/readFailure';
import {
  type NodeAnswer,
  type NodeLevel,
  type NodeRequest,
  type NodeStructureSource,
  type WalkFailurePlace,
  walkPackage,
  walkPackages,
} from '../../lib/strategies/packageWalk';
import { failed, succeeded } from '../../lib/strategies/stepResponse';

/** The walk's failures, classified as `SearchSource` classifies them (SAP answers skipped). */
const classified = (failure: unknown, place: WalkFailurePlace) =>
  failedRead(skipSapAnswers, failure, place);

/**
 * `P` lists a subpackage node (1) and a program node (2); its subpackages are
 * `SA` (one program) and `SB` (one program).
 */
const LEVELS: Record<string, NodeLevel> = {
  'P|root': {
    objects: [],
    childNodes: [
      { type: 'DEVC/K', nodeId: '1' },
      { type: 'PROG/P', nodeId: '2' },
    ],
  },
  'P|1': {
    objects: [
      { name: 'SA', type: 'DEVC/K' },
      { name: 'SB', type: 'DEVC/K' },
    ],
    childNodes: [],
  },
  'P|2': { objects: [{ name: 'PPROG', type: 'PROG/P' }], childNodes: [] },
  'SA|root': { objects: [], childNodes: [{ type: 'PROG/P', nodeId: '2' }] },
  'SA|2': { objects: [{ name: 'SAPROG', type: 'PROG/P' }], childNodes: [] },
  'SB|root': { objects: [], childNodes: [{ type: 'PROG/P', nodeId: '2' }] },
  'SB|2': { objects: [{ name: 'SBPROG', type: 'PROG/P' }], childNodes: [] },
};

/** The answer of a level, or SAP's refusal of it with `status`. */
function answerOf(
  key: string,
  refused: Readonly<Record<string, number>>,
): NodeAnswer {
  const status = refused[key];
  if (status !== undefined) {
    return failed({
      message: `status ${status}`,
      origin: 'refusal',
      response: { status, statusText: 'Refused', headers: {}, data: '' },
    });
  }
  return succeeded(LEVELS[key] ?? { objects: [], childNodes: [] });
}

const keyOf = (name: string, nodeId?: string) => `${name}|${nodeId ?? 'root'}`;

function source(refused: Readonly<Record<string, number>> = {}) {
  const asked: string[] = [];
  const utils: NodeStructureSource = {
    async fetchNodeStructure(_type, name, options) {
      const key = keyOf(name, options?.nodeId);
      asked.push(key);
      return answerOf(key, refused);
    },
  };
  return { utils, asked };
}

function levelReader(refused: Readonly<Record<string, number>> = {}) {
  const asked: string[] = [];
  const read = async (
    requests: readonly NodeRequest[],
  ): Promise<PhaseResult<NodeAnswer>[]> =>
    requests.map((request) => {
      const key = keyOf(request.parentName, request.nodeId);
      asked.push(key);
      return { ok: true, value: answerOf(key, refused) };
    });
  return { read, asked };
}

const names = (items: ReadonlyArray<{ name: string }>) =>
  items.map((i) => i.name).sort();

describe.each([
  [
    'a refused type node',
    { 'P|2': 500 },
    ['SA', 'SAPROG', 'SB', 'SBPROG'],
    ['P', 'SA', 'SB'],
  ],
  [
    'a type node answering 404',
    { 'P|2': 404 },
    ['SA', 'SAPROG', 'SB', 'SBPROG'],
    ['P', 'SA', 'SB'],
  ],
  [
    'a refused subpackage',
    { 'SB|root': 500 },
    ['PPROG', 'SA', 'SAPROG', 'SB'],
    ['P', 'SA'],
  ],
  [
    'a subpackage answering 404',
    { 'SB|root': 404 },
    ['PPROG', 'SA', 'SAPROG', 'SB'],
    ['P', 'SA'],
  ],
] as const)(
  'under the branch rule, %s excludes only its branch',
  (_case, refused, found, _walked) => {
    it('walkPackage', async () => {
      const { utils, asked } = source(refused);
      const options = {
        includeSubpackages: true,
        missingLevel: 'refused' as const,
        branchRule: { onFailure: classified },
      };
      expect(names(await walkPackage(utils, 'P', options))).toEqual(found);
      expect(asked.some((k) => k.startsWith('SB|') && k !== 'SB|root')).toBe(
        !('SB|root' in refused),
      );
    });

    it('walkPackages', async () => {
      const { read, asked } = levelReader(refused);
      const options = {
        includeSubpackages: true,
        missingLevel: 'refused' as const,
        branchRule: { onFailure: classified },
      };
      const [settled] = await walkPackages(read, ['P'], options);
      expect(settled?.ok).toBe(true);
      if (settled?.ok) expect(names(settled.value)).toEqual(found);
      expect(asked.some((k) => k.startsWith('SB|') && k !== 'SB|root')).toBe(
        !('SB|root' in refused),
      );
    });
  },
);

describe('under the branch rule, the root is handed over at its place (DO22)', () => {
  it('walkPackage: a SAP-refused root is the package place; skipped, it yields nothing', async () => {
    const places: WalkFailurePlace[] = [];
    const { utils } = source({ 'P|root': 500 });
    const options = {
      includeSubpackages: true,
      missingLevel: 'refused' as const,
      branchRule: {
        onFailure: (failure: unknown, place: WalkFailurePlace) => {
          places.push(place);
          classified(failure, place);
        },
      },
    };
    expect(await walkPackage(utils, 'P', options)).toEqual([]);
    expect(places).toEqual([{ kind: 'package', package: 'P' }]);
  });

  it('walkPackages: a SAP-refused root is the package place; skipped, it settles empty', async () => {
    const places: WalkFailurePlace[] = [];
    const { read } = levelReader({ 'P|root': 404 });
    const options = {
      includeSubpackages: true,
      missingLevel: 'refused' as const,
      branchRule: {
        onFailure: (failure: unknown, place: WalkFailurePlace) => {
          places.push(place);
          classified(failure, place);
        },
      },
    };
    const [settled] = await walkPackages(read, ['P'], options);
    expect(settled).toEqual({ ok: true, value: [] });
    expect(places).toEqual([{ kind: 'package', package: 'P' }]);
  });

  it('each level is handed over with its place: a subpackage and a type node', async () => {
    const places: WalkFailurePlace[] = [];
    const { utils } = source({ 'SB|root': 500, 'SA|2': 500 });
    await walkPackage(utils, 'P', {
      includeSubpackages: true,
      missingLevel: 'refused',
      branchRule: {
        onFailure: (failure, place) => {
          places.push(place);
          classified(failure, place);
        },
      },
    });
    expect(places).toEqual([
      {
        kind: 'level',
        package: 'SA',
        level: { node: { id: '2', type: 'PROG/P' } },
      },
      { kind: 'level', package: 'P', level: { subpackage: 'SB' } },
    ]);
  });
});

describe('under the branch rule, a credential refusal at any level ends the walk', () => {
  it.each([['P|2'], ['SB|root']])('walkPackage, at %s', async (key) => {
    const { utils } = source({ [key]: 401 });
    const options = {
      includeSubpackages: true,
      missingLevel: 'refused' as const,
      branchRule: { onFailure: classified },
    };
    await expect(walkPackage(utils, 'P', options)).rejects.toBeDefined();
  });

  it.each([['P|2'], ['SB|root']])('walkPackages, at %s', async (key) => {
    const { read } = levelReader({ [key]: 401 });
    const options = {
      includeSubpackages: true,
      missingLevel: 'refused' as const,
      branchRule: { onFailure: classified },
    };
    await expect(walkPackages(read, ['P'], options)).rejects.toBeDefined();
  });
});

describe('the other walking tools are unchanged: without the branch rule a refused level ends the package', () => {
  it.each([['P|2'], ['SB|root']])('walkPackage, at %s', async (key) => {
    const { utils } = source({ [key]: 500 });
    await expect(
      walkPackage(utils, 'P', { includeSubpackages: true }),
    ).rejects.toBeDefined();
  });

  it.each([['P|2'], ['SB|root']])('walkPackages, at %s', async (key) => {
    const { read } = levelReader({ [key]: 500 });
    const [settled] = await walkPackages(read, ['P'], {
      includeSubpackages: true,
    });
    expect(settled?.ok).toBe(false);
  });

  it('a 404 level stays empty without missingLevel: refused', async () => {
    const { utils } = source({ 'P|2': 404 });
    expect(
      names(await walkPackage(utils, 'P', { includeSubpackages: true })),
    ).toEqual(['SA', 'SAPROG', 'SB', 'SBPROG']);
  });
});

describe('a level of any size', () => {
  /** `P` holds the subpackage `S`, whose program node lists 300 000 programs. */
  const huge = Array.from({ length: 300_000 }, (_, i) => ({
    name: `P${i}`,
    type: 'PROG/P',
  }));
  const big: Record<string, NodeLevel> = {
    'P|root': { objects: [], childNodes: [{ type: 'DEVC/K', nodeId: '1' }] },
    'P|1': { objects: [{ name: 'S', type: 'DEVC/K' }], childNodes: [] },
    'S|root': { objects: [], childNodes: [{ type: 'PROG/P', nodeId: '2' }] },
    'S|2': { objects: huge, childNodes: [] },
  };
  const level = (key: string): NodeAnswer =>
    succeeded(big[key] ?? { objects: [], childNodes: [] });

  it('walkPackage answers every object', async () => {
    const utils: NodeStructureSource = {
      async fetchNodeStructure(_type, name, options) {
        return level(keyOf(name, options?.nodeId));
      },
    };
    const found = await walkPackage(utils, 'P', { includeSubpackages: true });
    expect(found).toHaveLength(300_001);
  });

  it('walkPackages answers every object', async () => {
    const read = async (
      requests: readonly NodeRequest[],
    ): Promise<PhaseResult<NodeAnswer>[]> =>
      requests.map((request) => ({
        ok: true,
        value: level(keyOf(request.parentName, request.nodeId)),
      }));
    const [settled] = await walkPackages(read, ['P'], {
      includeSubpackages: true,
    });
    expect(settled?.ok && settled.value).toHaveLength(300_001);
  });
});

describe('under the branch rule, a raw 401 at the root or a level ends the walk, never a SAP answer (DO22)', () => {
  it.each([['P|root'], ['P|2'], ['SB|root']])(
    'walkPackage, at %s',
    async (key) => {
      const asked: string[] = [];
      const raw = { response: { status: 401 } };
      const utils: NodeStructureSource = {
        async fetchNodeStructure(_type, name, options) {
          const at = keyOf(name, options?.nodeId);
          if (at === key) throw raw;
          return answerOf(at, {});
        },
      };
      await expect(
        walkPackage(utils, 'P', {
          includeSubpackages: true,
          missingLevel: 'refused',
          branchRule: {
            onFailure: (failure, place) =>
              failedRead(
                {
                  decide(_f, p) {
                    asked.push(p.kind);
                    return 'skip';
                  },
                },
                failure,
                place,
              ),
          },
        }),
      ).rejects.toBe(raw);
      expect(asked).toEqual([]);
    },
  );
});
