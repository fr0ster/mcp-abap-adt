/**
 * The interim Jest run's workers (D27, step 17; measured on a developer
 * machine and every CI runner kind, docs/development/tests/TESTING_GUIDE.md,
 * "Jest's workers"): `jest.config.js` states both settings — 4 workers, each
 * restarted once idle above 512MB — and nothing overrides them, so a local
 * run and every CI runner kind run Jest alike.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO } from './toolRuns';

describe("the interim Jest run's workers", () => {
  it('jest.config.js states 4 workers and a 512MB idle memory limit', () => {
    const config: unknown = require(path.join(REPO, 'jest.config.js'));
    assert.ok(typeof config === 'object' && config !== null);
    assert.equal(Reflect.get(config, 'maxWorkers'), 4);
    assert.equal(Reflect.get(config, 'workerIdleMemoryLimit'), '512MB');
  });

  it('no npm script and no workflow overrides them', () => {
    const sources = [
      'package.json',
      ...fs
        .readdirSync(path.join(REPO, '.github', 'workflows'))
        .map((file) => path.join('.github', 'workflows', file)),
    ];
    const overrides = sources.filter((file) => {
      const text = fs.readFileSync(path.join(REPO, file), 'utf8');
      return (
        text.includes('maxWorkers') ||
        text.includes('workerIdleMemoryLimit') ||
        text.includes('--runInBand')
      );
    });
    assert.deepEqual(overrides, []);
  });
});
