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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
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
import { rejectionOf } from '../helpers/assertions';
import { levelOf } from '../helpers/nodeLevels';

/** The walk's failures, classified as `SearchSource` classifies them (SAP answers skipped). */
const classified = (failure: unknown, place: WalkFailurePlace) =>
  failedRead(skipSapAnswers, failure, place);

/**
 * `P` lists a subpackage node (1) and a program node (2); its subpackages are
 * `SA` (one program) and `SB` (one program).
 */
const LEVELS: Record<string, NodeLevel> = {
  'P|root': levelOf(
    [],
    [
      { type: 'DEVC/K', nodeId: '1' },
      { type: 'PROG/P', nodeId: '2' },
    ],
  ),
  'P|1': levelOf(
    [
      { name: 'SA', type: 'DEVC/K' },
      { name: 'SB', type: 'DEVC/K' },
    ],
    [],
  ),
  'P|2': levelOf([{ name: 'PPROG', type: 'PROG/P' }], []),
  'SA|root': levelOf([], [{ type: 'PROG/P', nodeId: '2' }]),
  'SA|2': levelOf([{ name: 'SAPROG', type: 'PROG/P' }], []),
  'SB|root': levelOf([], [{ type: 'PROG/P', nodeId: '2' }]),
  'SB|2': levelOf([{ name: 'SBPROG', type: 'PROG/P' }], []),
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
  return succeeded(LEVELS[key] ?? levelOf([], []));
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

for (const [_case, refused, found, _walked] of [
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
] as const) {
  describe(
    format('under the branch rule, %s excludes only its branch', _case),
    () => {
      it('walkPackage', async () => {
        const { utils, asked } = source(refused);
        const options = {
          includeSubpackages: true,
          missingLevel: 'refused' as const,
          branchRule: { onFailure: classified },
        };
        assert.deepStrictEqual(
          names(await walkPackage(utils, 'P', options)),
          found,
        );
        assert.equal(
          asked.some((k) => k.startsWith('SB|') && k !== 'SB|root'),
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
        assert.equal(settled?.ok, true);
        if (settled?.ok) assert.deepStrictEqual(names(settled.value), found);
        assert.equal(
          asked.some((k) => k.startsWith('SB|') && k !== 'SB|root'),
          !('SB|root' in refused),
        );
      });
    },
  );
}

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
    assert.deepStrictEqual(await walkPackage(utils, 'P', options), []);
    assert.deepStrictEqual(places, [{ kind: 'package', package: 'P' }]);
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
    assert.deepStrictEqual(settled, { ok: true, value: [] });
    assert.deepStrictEqual(places, [{ kind: 'package', package: 'P' }]);
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
    assert.deepStrictEqual(places, [
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
  for (const [key] of [['P|2'], ['SB|root']]) {
    it(format('walkPackage, at %s', key), async () => {
      const { utils } = source({ [key]: 401 });
      const options = {
        includeSubpackages: true,
        missingLevel: 'refused' as const,
        branchRule: { onFailure: classified },
      };
      assert.notEqual(
        await rejectionOf(walkPackage(utils, 'P', options)),
        undefined,
      );
    });
  }

  for (const [key] of [['P|2'], ['SB|root']]) {
    it(format('walkPackages, at %s', key), async () => {
      const { read } = levelReader({ [key]: 401 });
      const options = {
        includeSubpackages: true,
        missingLevel: 'refused' as const,
        branchRule: { onFailure: classified },
      };
      assert.notEqual(
        await rejectionOf(walkPackages(read, ['P'], options)),
        undefined,
      );
    });
  }
});

describe('the other walking tools are unchanged: without the branch rule a refused level ends the package', () => {
  for (const [key] of [['P|2'], ['SB|root']]) {
    it(format('walkPackage, at %s', key), async () => {
      const { utils } = source({ [key]: 500 });
      assert.notEqual(
        await rejectionOf(
          walkPackage(utils, 'P', { includeSubpackages: true }),
        ),
        undefined,
      );
    });
  }

  for (const [key] of [['P|2'], ['SB|root']]) {
    it(format('walkPackages, at %s', key), async () => {
      const { read } = levelReader({ [key]: 500 });
      const [settled] = await walkPackages(read, ['P'], {
        includeSubpackages: true,
      });
      assert.equal(settled?.ok, false);
    });
  }

  it('a 404 level stays empty without missingLevel: refused', async () => {
    const { utils } = source({ 'P|2': 404 });
    assert.deepStrictEqual(
      names(await walkPackage(utils, 'P', { includeSubpackages: true })),
      ['SA', 'SAPROG', 'SB', 'SBPROG'],
    );
  });
});

describe('a level of any size', () => {
  /** `P` holds the subpackage `S`, whose program node lists 300 000 programs. */
  const huge = Array.from({ length: 300_000 }, (_, i) => ({
    name: `P${i}`,
    type: 'PROG/P',
  }));
  const big: Record<string, NodeLevel> = {
    'P|root': levelOf([], [{ type: 'DEVC/K', nodeId: '1' }]),
    'P|1': levelOf([{ name: 'S', type: 'DEVC/K' }], []),
    'S|root': levelOf([], [{ type: 'PROG/P', nodeId: '2' }]),
    'S|2': levelOf(huge, []),
  };
  const level = (key: string): NodeAnswer =>
    succeeded(big[key] ?? levelOf([], []));

  it('walkPackage answers every object', async () => {
    const utils: NodeStructureSource = {
      async fetchNodeStructure(_type, name, options) {
        return level(keyOf(name, options?.nodeId));
      },
    };
    const found = await walkPackage(utils, 'P', { includeSubpackages: true });
    assert.equal(found.length, 300_001);
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
    assert.ok(settled?.ok);
    assert.equal(settled.value.length, 300_001);
  });
});

describe('under the branch rule, a raw 401 at the root or a level ends the walk, never a SAP answer (DO22)', () => {
  for (const [key] of [['P|root'], ['P|2'], ['SB|root']]) {
    it(format('walkPackage, at %s', key), async () => {
      const asked: string[] = [];
      const raw = { response: { status: 401 } };
      const utils: NodeStructureSource = {
        async fetchNodeStructure(_type, name, options) {
          const at = keyOf(name, options?.nodeId);
          if (at === key) throw raw;
          return answerOf(at, {});
        },
      };
      assert.equal(
        await rejectionOf(
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
        ),
        raw,
      );
      assert.deepStrictEqual(asked, []);
    });
  }
});
