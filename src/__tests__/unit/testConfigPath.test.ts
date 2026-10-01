import * as path from 'node:path';
import { testConfigPathFromEnv } from '../integration/helpers/configHelpers';

/**
 * One checkout, one config per system: `MCP_TEST_CONFIG` names the file a run
 * reads instead of `tests/test-config.yaml`. A system whose test names collide
 * with someone else's objects needs its own names, and editing the one shared
 * file back and forth between systems is how a run ends up on the wrong one.
 */
describe('the test config a run reads', () => {
  const root = path.resolve(__dirname, '../../..');

  it('is the default file when nothing names another', () => {
    expect(testConfigPathFromEnv({})).toBeUndefined();
    expect(testConfigPathFromEnv({ MCP_TEST_CONFIG: '  ' })).toBeUndefined();
  });

  it('resolves a relative name against the repository root', () => {
    expect(
      testConfigPathFromEnv({ MCP_TEST_CONFIG: 'tests/test-config.sys.yaml' }),
    ).toBe(path.join(root, 'tests', 'test-config.sys.yaml'));
  });

  it('keeps an absolute path as it is', () => {
    const absolute = path.join(root, 'elsewhere', 'config.yaml');
    expect(testConfigPathFromEnv({ MCP_TEST_CONFIG: absolute })).toBe(absolute);
  });
});
