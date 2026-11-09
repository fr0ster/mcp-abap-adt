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

describe('production builds the union per branch, without casts', () => {
  it('reports nothing', () => {
    const files = SCANNED.flatMap((dir) =>
      productionFiles(path.join(REPO, dir)),
    ).filter((file) => file.endsWith('.ts'));
    assert.ok(files.length > 100, `only ${files.length} files found`);
    assert.deepEqual(scanConstruction(files, OPTIONS, REPO), []);
  });
});
