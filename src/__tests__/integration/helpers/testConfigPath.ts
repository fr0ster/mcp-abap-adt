import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The config file `MCP_TEST_CONFIG` names, resolved against the repository
 * root when relative; `undefined` when the variable is not set.
 *
 * One place for every reader — `loadTestConfig`, Jest's `globalSetup` and the
 * shared-deps check — because they live at different depths: resolved by hand
 * from `src/__tests__/integration/` with the helpers' `../../../..`, the same
 * name landed one directory above the repository, and global setup skipped the
 * auth session while the tests read the right file. No dependencies, so the
 * global setup can import it without loading the server.
 *
 * The variable is a statement, not a hint: set but naming no file, or naming
 * a file that is not there, is refused here, never answered with the default
 * `tests/test-config.yaml`.
 */
export function testConfigPathFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.MCP_TEST_CONFIG;
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!value) {
    throw new Error('MCP_TEST_CONFIG is set but names no file');
  }
  const chosen = path.resolve(__dirname, '../../../..', value);
  if (!fs.existsSync(chosen)) {
    throw new Error(`MCP_TEST_CONFIG points to a missing file: ${chosen}`);
  }
  return chosen;
}
