/**
 * `--deferred-logon` / `MCP_DEFERRED_LOGON` / `deferred-logon` and
 * `--restore-session` / `MCP_RESTORE_SESSION` / `restore-session` (#353):
 * read by core's parameter table, so the parameter beats the variable and
 * the variable beats the configuration file. The destination's own `.env` is
 * not a source. The restore flag stated without the deferred logon stops the
 * start.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import type { YamlConfig } from '@mcp-abap-adt/lib/config';
import {
  generateYamlConfigTemplate,
  ParameterRefusal,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { load as loadYaml } from 'js-yaml';
import { CORE_PARAMETERS, readCoreConfig } from '../../config/coreParameters';
import { hydrateSystemContextFromEnvFile } from '../../config/envFileContext';
import { coreHelp, main } from '../../launcher';

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
  yaml: YamlConfig | null = null,
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

const restore = (
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: YamlConfig | null = null,
) => {
  const config = readCoreConfig(argv, env, yaml);
  return { value: config.restoreSession, source: config.restoreSessionSource };
};

describe('--restore-session: its forms and their precedence (with --deferred-logon)', () => {
  const on = ['--deferred-logon'];

  it('a bare --restore-session is on, from the parameter', () => {
    assert.deepEqual(restore([...on, '--restore-session']), {
      value: true,
      source: '--restore-session',
    });
  });

  it('not stated: undefined, with no source', () => {
    assert.deepEqual(restore(on), { value: undefined, source: undefined });
  });

  it('the parameter beats the variable', () => {
    assert.deepEqual(
      restore([...on, '--restore-session=false'], {
        MCP_RESTORE_SESSION: 'true',
      }),
      { value: false, source: '--restore-session' },
    );
    assert.deepEqual(
      restore([...on, '--restore-session=true'], {
        MCP_RESTORE_SESSION: 'false',
      }),
      { value: true, source: '--restore-session' },
    );
  });

  it('the variable beats the configuration file', () => {
    assert.deepEqual(
      restore(
        on,
        { MCP_RESTORE_SESSION: 'true' },
        { 'restore-session': false },
      ),
      { value: true, source: 'MCP_RESTORE_SESSION' },
    );
    assert.deepEqual(
      restore(
        on,
        { MCP_RESTORE_SESSION: 'false' },
        { 'restore-session': true },
      ),
      { value: false, source: 'MCP_RESTORE_SESSION' },
    );
  });

  it('the configuration file alone', () => {
    assert.deepEqual(restore(on, {}, { 'restore-session': true }), {
      value: true,
      source: 'restore-session (config file)',
    });
  });

  it('an empty variable is not stated: the configuration file is read', () => {
    assert.deepEqual(
      restore(on, { MCP_RESTORE_SESSION: '' }, { 'restore-session': false }),
      { value: false, source: 'restore-session (config file)' },
    );
  });

  it('a word that is not true or false is refused, naming the form used', () => {
    assert.equal(
      refusalOf(() => restore([...on, '--restore-session=yes'])),
      'Invalid --restore-session: "yes". Must be true or false',
    );
    assert.equal(
      refusalOf(() => restore(on, { MCP_RESTORE_SESSION: 'yes' })),
      'Invalid MCP_RESTORE_SESSION: "yes". Must be true or false',
    );
  });

  it('accepted with --deferred-logon in each of its forms', () => {
    assert.equal(
      restore([], { MCP_DEFERRED_LOGON: 'true', MCP_RESTORE_SESSION: 'true' })
        .value,
      true,
    );
    assert.equal(
      restore(['--restore-session'], {}, { 'deferred-logon': true }).value,
      true,
    );
    assert.equal(
      restore(['--deferred-logon=true', '--restore-session=false']).value,
      false,
    );
  });

  it('--help names the parameter and the variable', () => {
    const help = coreHelp({ toolSet: fullToolSet });
    assert.equal(help.includes('--restore-session'), true);
    assert.equal(help.includes('MCP_RESTORE_SESSION'), true);
  });
});

/** The words every refusal of the restore flag without the deferred logon ends with. */
const NEEDS_DEFERRED =
  "needs --deferred-logon: a start without it takes up the destination's leftover session on its own";

describe('--restore-session without --deferred-logon is refused', () => {
  it('in each form, true or false, naming the form used', () => {
    for (const [argv, env, yaml, form] of [
      [['--restore-session'], {}, null, '--restore-session'],
      [['--restore-session=false'], {}, null, '--restore-session'],
      [[], { MCP_RESTORE_SESSION: 'true' }, null, 'MCP_RESTORE_SESSION'],
      [[], {}, { 'restore-session': false }, 'restore-session (config file)'],
    ] as const) {
      assert.equal(
        refusalOf(() => restore([...argv], { ...env }, yaml && { ...yaml })),
        `${form} ${NEEDS_DEFERRED}`,
        form,
      );
    }
  });

  it('--deferred-logon=false states it off: still refused', () => {
    assert.equal(
      refusalOf(() => restore(['--deferred-logon=false', '--restore-session'])),
      `--restore-session ${NEEDS_DEFERRED}`,
    );
  });

  it('the generated --conf template, used as it is, states neither: nothing refused', () => {
    const yaml = loadYaml(generateYamlConfigTemplate(CORE_PARAMETERS));
    assert.equal(typeof yaml === 'object' && yaml !== null, true);
    const config = readCoreConfig(
      [],
      {},
      typeof yaml === 'object' && yaml !== null ? { ...yaml } : null,
    );
    assert.equal(config.restoreSession, undefined);
    assert.equal(config.deferredLogon, false);
  });

  it('neither flag: nothing refused', () => {
    assert.deepEqual(restore([]), { value: undefined, source: undefined });
  });

  it('the start stops with exit 1 and the refusal, before anything is read or sent', async () => {
    const saved = { ...process.env };
    const exits: number[] = [];
    const lines: string[] = [];
    let opened = 0;
    const [, serverSide] = InMemoryTransport.createLinkedPair();
    serverSide.start = async () => {
      opened += 1;
    };
    try {
      process.env = {};
      await main(
        {
          toolSet: fullToolSet,
          program: 'mcp-abap-adt',
          version: '0.0.0-test',
          packageName: '@mcp-abap-adt/core',
        },
        {
          argv: ['--system-type=onprem', '--restore-session'],
          stdout: () => {},
          stderr: (line) => lines.push(line),
          exit: (code) => exits.push(code),
          processLike: { on: () => {} },
          transport: serverSide,
        },
      );
    } finally {
      process.env = saved;
    }
    assert.deepEqual(exits, [1]);
    assert.deepEqual(lines, [`[MCP] --restore-session ${NEEDS_DEFERRED}`]);
    assert.equal(opened, 0);
  });
});
