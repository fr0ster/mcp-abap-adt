/**
 * Hard or soft mode is decided in one place (#394, fourth review):
 * `getHardModeConfig()` (`testers/hardMode.ts`), whose
 * `environment.integration_hard_mode` wins over the top-level one. No other
 * integration source reads `integration_hard_mode…enabled` itself, so a
 * conflicting config cannot send init down one mode and the calls down the
 * other. Plain code over our own sources.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { repositoryRoot } from '../../helpers/repoRoot';

const INTEGRATION = path.join(
  repositoryRoot(__dirname),
  'src',
  '__tests__',
  'integration',
);

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sources(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('one source for hard or soft mode', () => {
  it('only hardMode.ts reads integration_hard_mode enabled', () => {
    const offenders = sources(INTEGRATION)
      .filter((file) => !file.endsWith(path.join('testers', 'hardMode.ts')))
      .filter((file) =>
        fs
          .readFileSync(file, 'utf8')
          .includes('integration_hard_mode?.enabled'),
      )
      .map((file) => path.relative(INTEGRATION, file));
    assert.deepEqual(offenders, []);
  });
});
