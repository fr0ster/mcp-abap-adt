import * as path from 'node:path';

/**
 * The config file `MCP_TEST_CONFIG` names, resolved against the repository
 * root when relative; `undefined` when the variable is not set.
 *
 * One place for both readers — `loadTestConfig` and Jest's `globalSetup` —
 * because they live at different depths: resolved by hand from
 * `src/__tests__/integration/` with the helpers' `../../../..`, the same name
 * landed one directory above the repository, and global setup skipped the
 * auth session while the tests read the right file. No dependencies, so the
 * global setup can import it without loading the server.
 */
export function testConfigPathFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env.MCP_TEST_CONFIG?.trim();
  if (!value) return undefined;
  return path.resolve(__dirname, '../../../..', value);
}
