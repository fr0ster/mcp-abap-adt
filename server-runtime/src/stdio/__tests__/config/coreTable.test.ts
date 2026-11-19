import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import type { YamlConfig } from '@mcp-abap-adt/lib/config';
import {
  generateYamlConfigTemplate,
  type ParameterTable,
  readParameters,
  validateYamlConfig as validateTable,
} from '@mcp-abap-adt/lib/config';
import { SYSTEM_TYPE_ROW } from '@mcp-abap-adt/responsible-rules';
import { load } from 'js-yaml';
import {
  assertNoProperty,
  assertThrows,
} from '../../../../../src/__tests__/helpers/assertions';
import {
  CORE_PARAMETERS,
  CORE_ROWS,
  readCoreConfig,
} from '../../config/coreParameters';
import { coreHelp } from '../../launcher';

/** core's own rows, and the system type it shares, read alone (no defaults of other rows). */
const AUTH_PARAMETERS = [...CORE_ROWS, SYSTEM_TYPE_ROW] as const;
const ROWS_ONLY: ParameterTable = {
  program: 'mcp-abap-adt',
  rows: AUTH_PARAMETERS,
  removed: CORE_PARAMETERS.removed,
};
const readAuthParameters = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml?: YamlConfig | null,
) => readParameters(ROWS_ONLY, argv, env, yaml) as Record<string, unknown>;
const generateHelp = () => coreHelp();
const template = () => generateYamlConfigTemplate(CORE_PARAMETERS);
const validateYamlConfig = (config: YamlConfig) =>
  validateTable(CORE_PARAMETERS, config);
/** The program's reading of `process.argv` and `process.env`. */
const parse = (yaml?: YamlConfig) =>
  readCoreConfig(process.argv.slice(2), process.env, yaml ?? null);

const sample = (p: (typeof AUTH_PARAMETERS)[number]): string => {
  if (p.kind === 'port') return '61001';
  if (p.kind === 'enum') return p.values?.[0] ?? '';
  return 'value-one';
};
const other = (p: (typeof AUTH_PARAMETERS)[number]): string => {
  if (p.kind === 'port') return '61002';
  if (p.kind === 'enum') return p.values?.[1] ?? '';
  return 'value-two';
};
const typed = (p: (typeof AUTH_PARAMETERS)[number], v: string) =>
  p.kind === 'port' ? Number(v) : v;

const NO_ENV = ['MCP_DESTINATION', 'MCP_ENV'];
/** Removed in 16.0.0: its only purpose was to switch off the working directory's .env. */
const REMOVED_ENV = 'MCP_USE_AUTH_BROKER';
const ENV_NAMES = [
  ...AUTH_PARAMETERS.flatMap((p) => (p.env ? [p.env] : [])),
  ...NO_ENV,
  REMOVED_ENV,
];
const savedArgv = process.argv;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  process.argv = ['node', 'server'];
  for (const n of ENV_NAMES) {
    savedEnv[n] = process.env[n];
    delete process.env[n];
  }
});
afterEach(() => {
  process.argv = savedArgv;
  for (const n of ENV_NAMES) {
    if (savedEnv[n] === undefined) delete process.env[n];
    else process.env[n] = savedEnv[n];
  }
});

describe('the table', () => {
  it('has the destination rows, then the system type it shares', () => {
    assert.deepStrictEqual(
      AUTH_PARAMETERS.map((p) => p.cli),
      [
        '--mcp',
        '--env',
        '--env-path',
        '--auth-broker-path',
        '--unsafe',
        '--browser',
        '--browser-program',
        '--renewal',
        '--browser-auth-port',
        '--deferred-logon',
        '--restore-session',
        '--connection-type',
        '--system-type',
      ],
    );
  });

  it('names each form as the spec does (spec section 6)', () => {
    assert.deepStrictEqual(
      AUTH_PARAMETERS.map((p) => [p.cli, p.env, p.yaml]),
      [
        ['--mcp', undefined, 'mcp'],
        ['--env', undefined, 'env'],
        ['--env-path', 'MCP_ENV_PATH', 'env-path'],
        ['--auth-broker-path', 'AUTH_BROKER_PATH', 'auth-broker-path'],
        ['--unsafe', 'MCP_UNSAFE', 'unsafe'],
        ['--browser', 'MCP_BROWSER', 'browser'],
        ['--browser-program', 'MCP_BROWSER_PROGRAM', 'browser-program'],
        ['--renewal', 'MCP_RENEWAL', 'renewal'],
        ['--browser-auth-port', 'MCP_BROWSER_AUTH_PORT', 'browser-auth-port'],
        ['--deferred-logon', 'MCP_DEFERRED_LOGON', 'deferred-logon'],
        ['--restore-session', 'MCP_RESTORE_SESSION', 'restore-session'],
        ['--connection-type', 'SAP_CONNECTION_TYPE', 'connection-type'],
        ['--system-type', 'SAP_SYSTEM_TYPE', 'system-type'],
      ],
    );
  });

  for (const [_n, row] of AUTH_PARAMETERS.map((p) => [p.cli, p] as const)) {
    describe(format('%s', _n), () => {
      const p = row as typeof row & { env: string; yaml: string };
      const hasEnv = row.env !== undefined;
      const value = p.kind === 'flag' ? true : typed(p, sample(p));
      const cliArgs = p.kind === 'flag' ? [p.cli] : [`${p.cli}=${sample(p)}`];
      const envValue = p.kind === 'flag' ? 'true' : sample(p);

      it('CLI, env and YAML alone give the same field', () => {
        const fromCli = readAuthParameters(cliArgs, {}, null);
        const fromSpace =
          p.kind === 'flag'
            ? fromCli
            : readAuthParameters([p.cli, sample(p)], {}, null);
        const fromYaml = readAuthParameters([], {}, { [p.yaml]: value });
        assert.deepStrictEqual(fromCli, { [p.key]: value });
        assert.deepStrictEqual(fromSpace, fromCli);
        if (hasEnv) {
          assert.deepStrictEqual(
            readAuthParameters([], { [p.env]: envValue }, null),
            fromCli,
          );
        }
        assert.deepStrictEqual(fromYaml, fromCli);
      });

      it('CLI beats env beats YAML', () => {
        if (!hasEnv) return;
        if (p.kind === 'flag') {
          // a flag can only be true on the CLI; env false/YAML true shows the order
          assert.deepStrictEqual(
            readAuthParameters(
              [p.cli],
              { [p.env]: 'false' },
              { [p.yaml]: false },
            ),
            { [p.key]: true },
          );
          assert.deepStrictEqual(
            readAuthParameters([], { [p.env]: 'false' }, { [p.yaml]: true }),
            { [p.key]: false },
          );
          return;
        }
        const a = sample(p);
        const b = other(p);
        const c =
          p.kind === 'port'
            ? '61003'
            : p.values
              ? (p.values[2] ?? p.values[0])
              : 'value-three';
        assert.deepStrictEqual(
          readAuthParameters(
            [`${p.cli}=${a}`],
            { [p.env]: b },
            { [p.yaml]: c },
          ),
          { [p.key]: typed(p, a) },
        );
        assert.deepStrictEqual(
          readAuthParameters([], { [p.env]: b }, { [p.yaml]: c }),
          { [p.key]: typed(p, b) },
        );
      });

      it('absent everywhere is absent', () => {
        // The keys are flat names (coreParameters.ts), so Jest's path walk
        // is one step.
        assertNoProperty(readAuthParameters([], {}, {}), p.key);
      });

      it('is named in the --config template and in the help', () => {
        assert.match(template(), new RegExp(`^${p.yaml}:`, 'm'));
        const help = generateHelp();
        assert.ok(help.includes(p.cli));
        if (hasEnv) assert.ok(help.includes(p.env));
      });
    });
  }
});

describe('--auth-broker is gone in every form', () => {
  it('has no row, no help line, no template key', () => {
    assert.ok(!AUTH_PARAMETERS.map((p) => p.cli).includes('--auth-broker'));
    assert.ok(!AUTH_PARAMETERS.map((p) => p.yaml).includes('auth-broker'));
    const help = generateHelp();
    assert.doesNotMatch(help, /--auth-broker(?!-path)/);
    assert.ok(!help.includes(REMOVED_ENV));
    assert.doesNotMatch(template(), /^auth-broker:/m);
  });

  for (const [argv, env, yaml, name] of [
    [['--auth-broker'], {}, undefined, '--auth-broker'],
    [['--auth-broker=true'], {}, undefined, '--auth-broker'],
    [[], { [REMOVED_ENV]: 'true' }, undefined, REMOVED_ENV],
    [[], { [REMOVED_ENV]: 'false' }, undefined, REMOVED_ENV],
    [[], {}, { 'auth-broker': true }, 'auth-broker (config file)'],
    [[], {}, { 'auth-broker': false }, 'auth-broker (config file)'],
  ] as const) {
    it(
      format(
        'a leftover form stops the start, naming it (%j %j %j)',
        argv,
        env,
        yaml,
      ),
      () => {
        assertThrows(
          () => readAuthParameters(argv, { ...env }, yaml as never),
          `${name} was removed in 16.0.0 — remove it from the configuration`,
        );
      },
    );
  }

  it('the reader refuses a leftover form, so the start stops', () => {
    process.argv = ['node', 'server', '--auth-broker'];
    assertThrows(() => parse(), '--auth-broker was removed in 16.0.0');
    process.argv = ['node', 'server'];
    process.env[REMOVED_ENV] = 'true';
    assertThrows(() => parse(), `${REMOVED_ENV} was removed in 16.0.0`);
  });

  it('a YAML config with the removed key fails validation, naming it', () => {
    const result = validateYamlConfig({ 'auth-broker': true } as never);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'auth-broker (config file) was removed in 16.0.0 — remove it from the configuration',
      ),
    );
  });

  it('--auth-broker-path is not mistaken for the removed flag', () => {
    assert.deepStrictEqual(
      readAuthParameters(['--auth-broker-path=/x'], {}, undefined),
      { authBrokerPath: '/x' },
    );
  });
});

describe('the generated template', () => {
  it('is valid YAML config and sets nothing', () => {
    const config = load(template()) as never;
    assert.deepStrictEqual(validateYamlConfig(config).errors, []);
    assert.deepStrictEqual(readAuthParameters([], {}, config), {
      unsafe: false,
      deferredLogon: false,
    });
  });
});

describe('ports', () => {
  const port = AUTH_PARAMETERS.find((p) => p.key === 'browserAuthPort');
  if (!port) throw new Error('row missing');

  for (const bad of ['abc', '0', '70000', '-1', '12.5']) {
    it(format('refuses %s in each form, naming the form', bad), () => {
      assertThrows(
        () => readAuthParameters([`--browser-auth-port=${bad}`], {}, null),
        /--browser-auth-port/,
      );
      assertThrows(
        () => readAuthParameters([], { MCP_BROWSER_AUTH_PORT: bad }, null),
        /MCP_BROWSER_AUTH_PORT/,
      );
      assertThrows(
        () => readAuthParameters([], {}, { 'browser-auth-port': bad }),
        /browser-auth-port/,
      );
      assert.match(
        validateYamlConfig({ 'browser-auth-port': bad } as never).errors.join(),
        /browser-auth-port/,
      );
    });
  }

  it('refuses a YAML number out of range', () => {
    assertThrows(
      () => readAuthParameters([], {}, { 'browser-auth-port': 70000 }),
      /browser-auth-port/,
    );
    assertThrows(
      () => readAuthParameters([], {}, { 'browser-auth-port': 0 }),
      /browser-auth-port/,
    );
  });

  it('accepts 61001 and leaves an absent port undefined', () => {
    assert.equal(
      readAuthParameters(['--browser-auth-port=61001'], {}, null)
        .browserAuthPort,
      61001,
    );
    assert.equal(readAuthParameters([], {}, null).browserAuthPort, undefined);
  });

  it('refuses a flag-looking next argument as a missing value', () => {
    assertThrows(
      () => readAuthParameters(['--browser-auth-port', '--unsafe'], {}, null),
      /--browser-auth-port needs a value/,
    );
  });
});

describe('enums', () => {
  for (const [cli, env, yaml, values] of [
    [
      '--connection-type',
      'SAP_CONNECTION_TYPE',
      'connection-type',
      ['http', 'rfc'],
    ],
    [
      '--system-type',
      'SAP_SYSTEM_TYPE',
      'system-type',
      ['onprem', 'cloud', 'legacy'],
    ],
  ] satisfies [string, string, string, string[]][]) {
    it(format('%s accepts only its values', cli), () => {
      for (const v of values as string[]) {
        assert.deepStrictEqual(
          Object.values(readAuthParameters([`${cli}=${v}`], {}, null)),
          [v],
        );
      }
      assert.deepStrictEqual(
        Object.values(
          readAuthParameters(
            [
              `${cli}=RFC`.replace(
                'RFC',
                (values as string[])[0].toUpperCase(),
              ),
            ],
            {},
            null,
          ),
        ),
        [(values as string[])[0]],
      );
      assertThrows(
        () => readAuthParameters([`${cli}=nope`], {}, null),
        new RegExp(cli),
      );
      assertThrows(
        () => readAuthParameters([], { [env as string]: 'nope' }, null),
        new RegExp(env as string),
      );
      assertThrows(
        () => readAuthParameters([], {}, { [yaml as string]: 'nope' }),
        new RegExp(yaml as string),
      );
      assert.equal(
        validateYamlConfig({ [yaml as string]: 'nope' } as never).valid,
        false,
      );
    });
  }
});

describe('flags', () => {
  it('refuse a word that is not true or false', () => {
    assertThrows(
      () => readAuthParameters([], { MCP_UNSAFE: 'yes' }, null),
      /MCP_UNSAFE/,
    );
    assertThrows(() => readAuthParameters([], {}, { unsafe: 'yes' }), /unsafe/);
  });
});

describe('through the parser and the manager', () => {
  it('--browser, MCP_BROWSER and YAML browser reach CoreConfig.browser', () => {
    process.argv = ['node', 'server', '--browser=firefox'];
    assert.equal(parse().browser, 'firefox');

    process.argv = ['node', 'server'];
    process.env.MCP_BROWSER = 'edge';
    assert.equal(parse().browser, 'edge');
  });

  it('env forms reach the config', () => {
    process.env.MCP_BROWSER_AUTH_PORT = '61005';
    const c = parse();
    assert.equal(c.browserAuthPort, 61005);
  });

  it('--mcp and --env have no env form', () => {
    process.env.MCP_DESTINATION = 'DEST';
    process.env.MCP_ENV = 'ENVDEST';
    const c = parse();
    assert.equal(c.mcpDestination, undefined);
    assert.equal(c.envFile, undefined);
    assert.deepStrictEqual(readAuthParameters([], process.env, null), {});
    const help = generateHelp();
    for (const n of NO_ENV) assert.doesNotMatch(help, new RegExp(`\\b${n}\\b`));
  });

  it('YAML is the lowest source: env beats it, CLI beats env', () => {
    const yaml = {
      mcp: 'FROM_YAML',
      browser: 'chrome',
      'connection-type': 'rfc',
    } as const;
    process.env.MCP_BROWSER = 'edge';
    process.argv = ['node', 'server', '--connection-type=http'];
    const parsed = parse({ ...yaml });
    assert.equal(parsed.mcpDestination, 'FROM_YAML');
    assert.equal(parsed.browser, 'edge');
    assert.equal(parsed.connectionType, 'http');
  });

  // The parser states the value and its source and leaves the environment
  // alone: written there early, it beat the env file's SAP_SYSTEM_TYPE even
  // from YAML. The launcher sets it after the file (effectiveSystemType).
  it('--system-type: stated with its source, SAP_SYSTEM_TYPE untouched', () => {
    const before = process.env.SAP_SYSTEM_TYPE;
    delete process.env.SAP_SYSTEM_TYPE;
    process.argv = ['node', 'server', '--system-type=onprem'];
    try {
      const parsed = parse();
      assert.equal(parsed.systemType, 'onprem');
      assert.equal(parsed.systemTypeSource, '--system-type');
      assert.equal(process.env.SAP_SYSTEM_TYPE, undefined);
    } finally {
      if (before === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = before;
    }
  });
});

/**
 * The env file's source, as the user gave it: it names the refusal of a file
 * that does not exist (Ruling 3), so it must be the form actually used.
 */
describe('the env file names its source', () => {
  let dir: string;
  const savedCwd = process.cwd();
  beforeEach(() => {
    // Real path: on macOS the temp dir is under /var, a link to /private/var,
    // and the parser resolves against the working directory's real path.
    dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'env-source-')),
    );
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(savedCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const [argv, env, yaml, source] of [
    [['--env-path=./conn.env'], {}, undefined, '--env-path'],
    [['--env=./conn.env'], {}, undefined, '--env'],
    [[], { MCP_ENV_PATH: './conn.env' }, undefined, 'MCP_ENV_PATH'],
    [[], {}, { 'env-path': './conn.env' }, 'env-path (config file)'],
    [[], {}, { env: './conn.env' }, 'env (config file)'],
    // --env with --env-path is refused (D26 D3): contradictoryDestination.test.ts
  ] as const) {
    it(format('%j %j %j → %s', argv, env, yaml, source), () => {
      process.argv = ['node', 'server', ...argv];
      Object.assign(process.env, env);
      const parsed = parse(yaml);
      assert.equal(parsed.envFile, path.resolve(dir, 'conn.env'));
      assert.equal(parsed.envFileSource, source);
    });
  }

  for (const [argv, env, yaml] of [[[], {}, undefined]] as const) {
    it(
      format(
        "the working directory's .env is never read (%j %j %j)",
        argv,
        env,
        yaml,
      ),
      () => {
        fs.writeFileSync(
          path.join(dir, '.env'),
          'SAP_URL=https://x.example.test\n',
        );
        process.argv = ['node', 'server', ...argv];
        Object.assign(process.env, env);
        const parsed = parse(yaml);
        assert.equal(parsed.envFile, undefined);
        assert.equal(parsed.envFileSource, undefined);
      },
    );
  }

  it('a relative --env-path still resolves against the working directory', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SAP_URL=https://x.example.test\n',
    );
    process.argv = ['node', 'server', '--env-path=./.env'];
    assert.equal(parse().envFile, path.resolve(dir, '.env'));
  });

  it('no env file → no source', () => {
    assert.equal(parse().envFileSource, undefined);
  });

  it('reaches CoreConfig through the reader', () => {
    process.argv = ['node', 'server', '--env-path=./conn.env'];
    assert.equal(parse().envFileSource, '--env-path');
  });
});
