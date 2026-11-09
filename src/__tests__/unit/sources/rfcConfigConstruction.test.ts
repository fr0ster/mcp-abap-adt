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
 * under its rule; the one under `clean` is not.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
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
  ['forbiddenUndefined.ts', 'forbidden-property'],
  ['forbiddenBySpread.ts', 'forbidden-property'],
  ['intermediateLiteral.ts', 'forbidden-property'],
  ['intermediateChain.ts', 'forbidden-property'],
  ['unannotatedReturn.ts', 'unannotated-return'],
  ['annotatedReturnForbidden.ts', 'forbidden-property'],
  ['crossSpread.ts', 'cross-spread'],
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

  it('reports nothing in the clean fixture', () => {
    assert.deepEqual(
      fixtureFindings.filter((found) => found.where.includes('/clean/')),
      [],
    );
  });
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
