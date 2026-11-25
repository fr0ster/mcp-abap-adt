#!/usr/bin/env node
/**
 * Records the terse goldens (`tests/fixtures/tools/terse-goldens.json`):
 * runs `src/__tests__/unit/detail/terseGoldens.test.ts` with
 * `WRITE_TERSE_GOLDENS=1`, every case of it. Run it as
 * `npm run goldens:terse` (which builds the tests first); a recorded change
 * is reviewed in its diff and named in its commit, the file formatted as
 * the repository formats it. Refused under CI.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const GOLDENS = 'tests/fixtures/tools/terse-goldens.json';

if (process.env.CI) {
  process.stderr.write('the goldens are not written under CI\n');
  process.exit(1);
}
execFileSync(
  process.execPath,
  [
    'tools/run-tests.mjs',
    '--concurrency',
    '1',
    '--env',
    'WRITE_TERSE_GOLDENS=1',
    'src/__tests__/unit/detail/terseGoldens.test.ts',
  ],
  { stdio: 'inherit' },
);
// The file as the repository's formatter writes it, so the pre-commit check
// takes it as recorded.
execFileSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome'),
    'format',
    '--write',
    GOLDENS,
  ],
  { stdio: 'inherit' },
);
