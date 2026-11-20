/**
 * Contradictory stdio destinations are refused (D26 D3, D4): `--env` with
 * `--env-path` (the path won, the name was ignored), and `--mcp` with an env
 * file (the destination was served, the file's credentials and URL ignored).
 * Each is refused before anything is read, naming both forms as used.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { ParameterRefusal } from '@mcp-abap-adt/lib/config';
import { readCoreConfig } from '../../config/coreParameters';

const KIND = '--system-type=onprem';

const refusalOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    if (error instanceof ParameterRefusal) return error.words;
    throw error;
  }
  return undefined;
};

describe('--env with --env-path', () => {
  it('both on the command line are refused, naming both', () => {
    assert.equal(
      refusalOf(() =>
        readCoreConfig([KIND, '--env=TRIAL', '--env-path=/tmp/x.env'], {}),
      ),
      '--env and --env-path both name the env file: give one of them',
    );
  });

  it('MCP_ENV_PATH beside --env is refused, naming the variable', () => {
    assert.equal(
      refusalOf(() =>
        readCoreConfig([KIND, '--env=TRIAL'], { MCP_ENV_PATH: '/tmp/x.env' }),
      ),
      '--env and MCP_ENV_PATH both name the env file: give one of them',
    );
  });

  it('either alone is read', () => {
    assert.equal(
      readCoreConfig([KIND, '--env-path=/tmp/x.env'], {}).envPath,
      '/tmp/x.env',
    );
  });
});

describe('--mcp with an env file', () => {
  for (const [argv, env, form] of [
    [['--env-path=/tmp/x.env'], {}, '--env-path'],
    [['--env=TRIAL'], {}, '--env'],
    [[], { MCP_ENV_PATH: '/tmp/x.env' }, 'MCP_ENV_PATH'],
  ] as const) {
    it(format('--mcp with %j %j is refused', argv, env), () => {
      assert.equal(
        refusalOf(() =>
          readCoreConfig([KIND, '--mcp=TRIAL', ...argv], { ...env }),
        ),
        `--mcp and ${form} both name the destination: give --mcp (a stored destination) or the env file, not both`,
      );
    });
  }

  it('--mcp alone is read', () => {
    assert.equal(
      readCoreConfig([KIND, '--mcp=TRIAL'], {}).mcpDestination,
      'TRIAL',
    );
  });
});
