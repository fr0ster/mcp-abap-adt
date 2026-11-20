import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertThrows } from '../helpers/assertions';
import { repositoryRoot } from '../helpers/repoRoot';
import { testConfigPathFromEnv } from '../integration/helpers/testConfigPath';

/**
 * One checkout, one config per system: `MCP_TEST_CONFIG` names the file a run
 * reads instead of `tests/test-config.yaml`. A system whose test names collide
 * with someone else's objects needs its own names, and editing the one shared
 * file back and forth between systems is how a run ends up on the wrong one.
 */
describe('the test config a run reads', () => {
  const root = repositoryRoot(__dirname);

  it('is the default file when nothing names another', () => {
    assert.equal(testConfigPathFromEnv({}), undefined);
  });

  it('refuses the variable set but naming no file', () => {
    assertThrows(
      () => testConfigPathFromEnv({ MCP_TEST_CONFIG: '' }),
      'MCP_TEST_CONFIG is set but names no file',
    );
    assertThrows(
      () => testConfigPathFromEnv({ MCP_TEST_CONFIG: '  ' }),
      'MCP_TEST_CONFIG is set but names no file',
    );
  });

  it('refuses a named file that is not there', () => {
    assertThrows(
      () =>
        testConfigPathFromEnv({ MCP_TEST_CONFIG: 'tests/no-such-config.yaml' }),
      `MCP_TEST_CONFIG points to a missing file: ${path.join(root, 'tests', 'no-such-config.yaml')}`,
    );
  });

  it('resolves a relative name against the repository root', () => {
    // A file of this repository that is always there.
    assert.equal(
      testConfigPathFromEnv({ MCP_TEST_CONFIG: 'package.json' }),
      path.join(root, 'package.json'),
    );
  });

  it('keeps an absolute path as it is', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'test-config-'));
    const absolute = path.join(directory, 'config.yaml');
    fs.writeFileSync(absolute, '');
    try {
      assert.equal(
        testConfigPathFromEnv({ MCP_TEST_CONFIG: absolute }),
        absolute,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
