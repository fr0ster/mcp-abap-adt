/**
 * `ISapConfig` is built without casts, per branch (24.0.0, spec §9): the
 * construction scan (`helpers/configConstructionScan.ts`, the compiler API
 * and its type checker — no pattern over code) over the production sources
 * of `src/lib`, `src/embeddable`, `src/handlers` and `server-runtime/src`
 * reports no assertion to a config type, no config literal built before its
 * wire is narrowed, no property its shape forbids (`undefined` included) and
 * no spread of the other shape.
 *
 * Each fixture under `__fixtures__/configConstruction/refused` is reported
 * under its rule; those under `clean` are not. Every refused fixture is
 * listed, and every file of the directory is.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import {
  type ConstructionRule,
  optionsOf,
  scanConstruction,
} from './helpers/configConstructionScan';
import { REPO } from './helpers/failureScan';
import { productionFiles } from './helpers/typeEscapeScan';

const OPTIONS = {
  ...optionsOf(path.join(REPO, 'tsconfig.test.json')),
  types: ['node'],
};

const SCANNED = [
  'src/lib',
  'src/embeddable',
  'src/handlers',
  'server-runtime/src',
];

const FIXTURES = path.join(
  REPO,
  'src/__tests__/unit/sources/__fixtures__/configConstruction',
);

/** Each refused fixture with the rule it breaks. */
const REFUSED: ReadonlyArray<[string, ConstructionRule]> = [
  ['assertion.ts', 'assertion'],
  ['preNarrowing.ts', 'pre-narrowing'],
  ['commonConfig.ts', 'pre-narrowing'],
  // forbidden-key: the type of the value that becomes a config, wherever it
  // comes from (round 1's probe is intermediateLiteral.ts; round 3's two are
  // the codex* files).
  ['forbiddenUndefined.ts', 'forbidden-key'],
  ['forbiddenBySpread.ts', 'forbidden-key'],
  ['intermediateLiteral.ts', 'forbidden-key'],
  ['intermediateChain.ts', 'forbidden-key'],
  ['unannotatedReturn.ts', 'forbidden-key'],
  ['annotatedReturnForbidden.ts', 'forbidden-key'],
  ['crossSpread.ts', 'forbidden-key'],
  ['codexIntermediateCall.ts', 'forbidden-key'],
  ['codexParenCallee.ts', 'forbidden-key'],
  ['unionSource.ts', 'forbidden-key'],
  ['conditionalSource.ts', 'forbidden-key'],
  ['spreadOfVariable.ts', 'forbidden-key'],
  ['optionalUndefined.ts', 'forbidden-key'],
  ['anySource.ts', 'unknown-keys'],
  ['constrainedGeneric.ts', 'forbidden-key'],
  // One per place a value becomes a config (BECOMES).
  ['formVariable.ts', 'forbidden-key'],
  ['formProperty.ts', 'forbidden-key'],
  ['formParameterDefault.ts', 'forbidden-key'],
  ['formAssignment.ts', 'forbidden-key'],
  ['formArgument.ts', 'forbidden-key'],
  ['formReturn.ts', 'forbidden-key'],
  ['formArrowBody.ts', 'forbidden-key'],
  ['formSatisfies.ts', 'forbidden-key'],
  ['formArrayElement.ts', 'forbidden-key'],
  ['formObjectElement.ts', 'forbidden-key'],
  ['formShorthand.ts', 'forbidden-key'],
];

describe('the construction scan', () => {
  const refused = REFUSED.map(([file]) => path.join(FIXTURES, 'refused', file));
  const clean = fs
    .readdirSync(path.join(FIXTURES, 'clean'))
    .map((file) => path.join(FIXTURES, 'clean', file));
  const fixtureFindings = scanConstruction(
    [...refused, ...clean],
    OPTIONS,
    REPO,
  );

  for (const [file, rule] of REFUSED) {
    it(`reports ${file} under ${rule}`, () => {
      const rules = fixtureFindings
        .filter((found) => found.where.includes(`/refused/${file}:`))
        .map((found) => found.rule);
      assert.ok(rules.includes(rule), `${file}: ${rules.join(', ')}`);
    });
  }

  it('lists every refused fixture of the directory', () => {
    assert.deepEqual(
      fs.readdirSync(path.join(FIXTURES, 'refused')).sort(),
      REFUSED.map(([file]) => file).sort(),
    );
  });

  it('reports nothing in the clean fixtures', () => {
    assert.deepEqual(
      fixtureFindings.filter((found) => found.where.includes('/clean/')),
      [],
    );
  });
});

/**
 * The guard's known limits (its header's "Not covered"): each fixture is NOT
 * found today. A fixture that starts being found — the guard grew — or a
 * limit added or dropped without its fixture fails here, so the list cannot
 * drift silently.
 */
const KNOWN_LIMITS: readonly string[] = [
  'destructuringDefault.ts',
  'getterReturn.ts',
  'yieldValue.ts',
];

/** The merged `never & undefined` limit: its two orders, in clean/. */
const KNOWN_LIMITS_IN_CLEAN: readonly string[] = [
  'mergedNeverUndefined.ts',
  'mergedNeverUndefinedReversed.ts',
];

describe('the known limits of the construction scan', () => {
  const dir = path.join(FIXTURES, 'limits');
  const names = fs.readdirSync(dir).sort();

  it('every limit has its fixture, and every fixture is a listed limit', () => {
    assert.deepEqual(names, [...KNOWN_LIMITS]);
  });

  const found = scanConstruction(
    names.map((file) => path.join(dir, file)),
    OPTIONS,
    REPO,
  );
  // A limit whose value compiles clean under the guard's own reading: its
  // fixture lives in clean/, and is pinned here by name.
  for (const file of KNOWN_LIMITS_IN_CLEAN) {
    it(`known limit, not found: clean/${file}`, () => {
      const at = path.join(FIXTURES, 'clean', file);
      assert.ok(fs.existsSync(at), `clean/${file} is missing`);
      assert.deepEqual(scanConstruction([at], OPTIONS, REPO), []);
    });
  }
  for (const file of KNOWN_LIMITS) {
    it(`known limit, not found: ${file}`, () => {
      assert.deepEqual(
        found.filter((each) => each.where.includes(`/limits/${file}:`)),
        [],
      );
    });
  }
});

/**
 * What the scan's limits let through, the compiler refuses: under the
 * production options (`exactOptionalPropertyTypes`, spec §3) each limit's
 * value, and each forbidden key the scan finds but one, is a type error. The merged
 * `never & undefined` limit stays the scan's (a declared value of the merged
 * type passes both), but no value with `url: undefined` can be built of that
 * type without an assertion, which the scan refuses.
 */
/**
 * The forbidden keys the compiler lets through (Measured): a conditional
 * whose branches differ in `url` — the union is reduced to one object type
 * with `url?: undefined`, which the option does not refuse. The scan's own.
 */
const COMPILER_PASSES: readonly string[] = ['conditionalSource.ts'];

describe('the compiler closes what the construction scan cannot see', () => {
  const refusedByCompiler = (file: string): boolean => {
    const program = ts.createProgram([file], OPTIONS);
    const source = program.getSourceFile(file);
    return (
      source !== undefined && program.getSemanticDiagnostics(source).length > 0
    );
  };
  for (const file of KNOWN_LIMITS) {
    it(`refuses the limit ${file}`, () => {
      assert.equal(
        refusedByCompiler(path.join(FIXTURES, 'limits', file)),
        true,
      );
    });
  }
  for (const [file, rule] of REFUSED) {
    if (rule !== 'forbidden-key') continue;
    const passes = COMPILER_PASSES.includes(file);
    it(`${passes ? 'lets through' : 'refuses'} the forbidden key of ${file}`, () => {
      assert.equal(
        refusedByCompiler(path.join(FIXTURES, 'refused', file)),
        !passes,
      );
    });
  }
});

describe('production builds the union per branch, without casts', () => {
  it('reports nothing', () => {
    const files = SCANNED.flatMap((dir) =>
      productionFiles(path.join(REPO, dir)),
    ).filter((file) => file.endsWith('.ts'));
    assert.ok(files.length > 100, `only ${files.length} files found`);
    assert.deepEqual(scanConstruction(files, OPTIONS, REPO), []);
  });
});
