/**
 * SAP's answers are judged by key, never by words (the owner's rule): its
 * answers and errors are told apart by the T100 key (message class and
 * number) and the message type, or by the structured verdict where SAP gives
 * no key — never by searching or comparing the text, which changes with the
 * logon language.
 *
 * The scan (`helpers/proseScan.ts`) runs on the TypeScript program with its
 * type checker over every package's production `src`, `scripts` and `tools`.
 * SAP text is recognised by type and flow, with no allowlist: a finding is
 * fixed in the code. Refused: a string search (`includes`, `indexOf`,
 * `startsWith`, `endsWith`, `match`, `search`, `split`, …) or an equality
 * comparison applied to SAP text, whatever its argument. Allowed: the
 * structured key and type fields a reader extracted, and a document's
 * structured values.
 *
 * Its limit, stated: a value reaching the call through another module by a
 * path the scan does not follow, or through an untyped value, is beyond this
 * check and left to review.
 *
 * Each fixture under `__fixtures__/prose/refused` is refused with its own
 * findings; each under `clean` passes.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import {
  createDerivationProgram,
  productionSources,
} from './helpers/authorizationDerivationScan';
import { REPO, rel } from './helpers/failureScan';
import { type ProseForm, scanProse } from './helpers/proseScan';

describe('production', () => {
  const files = productionSources();
  const program = createDerivationProgram(files);

  it('scans every package, the scripts and the tools', () => {
    const scanned = files.map(rel);
    assert.deepEqual(
      [
        'src/lib/utils.ts',
        'src/lib/logger.ts',
        'server-runtime/src/stdio/launcher.ts',
        'tools/runtime-profiling-dumps-explorer.js',
        'scripts/portable/smoke.mjs',
      ].filter((file) => !scanned.includes(file)),
      [],
    );
  });

  it('matches no SAP text by its words', () => {
    assert.deepEqual(scanProse(program, files), []);
  });
});

describe('the scan refuses each form, and only those', () => {
  const root = path.join(
    REPO,
    'src',
    '__tests__',
    'unit',
    'sources',
    '__fixtures__',
    'prose',
  );
  const listed = (dir: string) =>
    fs
      .readdirSync(path.join(root, dir))
      .map((name) => path.join(root, dir, name));
  const refused = listed('refused');
  const clean = listed('clean');
  const files = [...refused, ...clean];
  const findings = scanProse(createDerivationProgram(files), files);
  const of = (file: string) =>
    findings
      .filter((found) => found.where.startsWith(`${rel(file)}:`))
      .map((found) => found.form);

  const expected: Record<string, readonly ProseForm[]> = {
    absentPerCheck: ['search'],
    alreadyChecked: ['search', 'search', 'search'],
    alreadyExists: ['search', 'search'],
    singleWord: ['search', 'search'],
    messageQuote: ['search'],
    loggerExpected: ['search', 'search'],
    interfaceNotCreated: ['search', 'search'],
    computed: ['search', 'search'],
    equality: ['equality', 'equality'],
    membership: ['search'],
  };

  it('has a fixture for every refused form, each with its expectation', () => {
    assert.deepEqual(
      refused.map((file) => path.basename(file, '.ts')).sort(),
      Object.keys(expected).sort(),
    );
  });

  for (const file of refused) {
    const name = path.basename(file, '.ts');
    it(`refuses ${name}`, () => {
      assert.deepEqual(of(file), expected[name]);
    });
  }

  for (const file of clean) {
    it(`accepts ${path.basename(file, '.ts')}`, () => {
      assert.deepEqual(of(file), []);
    });
  }
});
