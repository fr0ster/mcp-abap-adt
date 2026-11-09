/**
 * The test config as Jest's `globalSetup` and `globalTeardown` read it,
 * outside the test runtime: the file `MCP_TEST_CONFIG` names (refused when
 * blank or missing), else `tests/test-config.yaml`; `undefined` when there
 * is none. The template is never read here: without a config nothing logs
 * on.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { repositoryRoot } from '../../helpers/repoRoot';
import { testConfigPathFromEnv } from './testConfigPath';

export function loadRunConfig(): unknown {
  const chosen = testConfigPathFromEnv();
  if (chosen !== undefined) {
    return yaml.load(fs.readFileSync(chosen, 'utf8'));
  }
  for (const candidate of [
    path.resolve(process.cwd(), 'tests', 'test-config.yaml'),
    path.join(repositoryRoot(__dirname), 'tests', 'test-config.yaml'),
  ]) {
    if (fs.existsSync(candidate)) {
      return yaml.load(fs.readFileSync(candidate, 'utf8'));
    }
  }
  return undefined;
}
