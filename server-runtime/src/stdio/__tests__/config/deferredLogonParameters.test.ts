/**
 * `--deferred-logon` / `MCP_DEFERRED_LOGON` / `deferred-logon` (#353): read
 * by core's parameter table, so the parameter beats the variable and the
 * variable beats the configuration file. The destination's own `.env` is
 * not a source.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { ParameterRefusal } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { readCoreConfig } from '../../config/coreParameters';
import { hydrateSystemContextFromEnvFile } from '../../config/envFileContext';
import { coreHelp } from '../../launcher';

/** The words of a refusal `read` throws, or undefined when it reads. */
function refusalOf(read: () => unknown): string | undefined {
  try {
    read();
    return undefined;
  } catch (error) {
    if (error instanceof ParameterRefusal) return error.words;
    throw error;
  }
}

const deferred = (
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: Record<string, unknown> | null = null,
) => readCoreConfig(argv, env, yaml).deferredLogon;

describe('--deferred-logon: its forms and their precedence', () => {
  it('a bare --deferred-logon is on', () => {
    assert.equal(deferred(['--deferred-logon']), true);
  });

  it('none of the three forms: off', () => {
    assert.equal(deferred([]), false);
  });

  it('the parameter beats the variable', () => {
    assert.equal(
      deferred(['--deferred-logon=false'], { MCP_DEFERRED_LOGON: 'true' }),
      false,
    );
    assert.equal(
      deferred(['--deferred-logon=true'], { MCP_DEFERRED_LOGON: 'false' }),
      true,
    );
  });

  it('the variable beats the configuration file', () => {
    assert.equal(
      deferred([], { MCP_DEFERRED_LOGON: 'true' }, { 'deferred-logon': false }),
      true,
    );
    assert.equal(
      deferred([], { MCP_DEFERRED_LOGON: 'false' }, { 'deferred-logon': true }),
      false,
    );
  });

  it('the configuration file alone', () => {
    assert.equal(deferred([], {}, { 'deferred-logon': true }), true);
    assert.equal(deferred([], {}, { 'deferred-logon': false }), false);
  });

  it('the variable alone, in any case', () => {
    assert.equal(deferred([], { MCP_DEFERRED_LOGON: 'TRUE' }), true);
  });

  it('an empty variable is not stated: the configuration file is read', () => {
    assert.equal(
      deferred([], { MCP_DEFERRED_LOGON: '' }, { 'deferred-logon': true }),
      true,
    );
  });

  it('a word that is not true or false is refused, naming the form used', () => {
    assert.equal(
      refusalOf(() => deferred(['--deferred-logon=yes'])),
      'Invalid --deferred-logon: "yes". Must be true or false',
    );
    assert.equal(
      refusalOf(() => deferred([], { MCP_DEFERRED_LOGON: 'yes' })),
      'Invalid MCP_DEFERRED_LOGON: "yes". Must be true or false',
    );
    assert.equal(
      refusalOf(() => deferred([], {}, { 'deferred-logon': 'yes' })),
      'Invalid deferred-logon (config file): "yes". Must be true or false',
    );
  });

  describe("the destination's .env is not a source", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-env-'));
    after(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('MCP_DEFERRED_LOGON stated in it changes nothing', () => {
      const envFile = path.join(dir, 'destination.env');
      fs.writeFileSync(envFile, 'MCP_DEFERRED_LOGON=true\n');
      const env: NodeJS.ProcessEnv = {};
      hydrateSystemContextFromEnvFile(envFile, env);
      assert.equal(env.MCP_DEFERRED_LOGON, undefined);
      assert.equal(deferred([`--env-path=${envFile}`], env), false);
    });
  });

  it('--help names the parameter and the variable', () => {
    const help = coreHelp({ toolSet: fullToolSet });
    assert.equal(help.includes('--deferred-logon'), true);
    assert.equal(help.includes('MCP_DEFERRED_LOGON'), true);
  });
});
