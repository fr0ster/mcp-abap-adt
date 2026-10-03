import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { load } from 'js-yaml';
import { ArgumentsParser } from '../../../lib/config/ArgumentsParser';
import {
  AUTH_PARAMETERS,
  readAuthParameters,
} from '../../../lib/config/authParameters';
import { ServerConfigManager } from '../../../lib/config/ServerConfigManager';
import {
  applyYamlConfigToArgs,
  generateYamlConfigTemplate,
  validateYamlConfig,
} from '../../../lib/config/yamlConfig';

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

const NO_ENV = ['MCP_DESTINATION', 'MCP_ENV', 'MCP_ALLOW_DESTINATION_HEADER'];
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
  it('has the ten rows of the spec', () => {
    expect(AUTH_PARAMETERS.map((p) => p.cli)).toEqual([
      '--mcp',
      '--env',
      '--env-path',
      '--auth-broker-path',
      '--unsafe',
      '--browser',
      '--browser-auth-port',
      '--allow-destination-header',
      '--connection-type',
      '--system-type',
    ]);
  });

  it('names each form as the spec does (spec section 6)', () => {
    expect(AUTH_PARAMETERS.map((p) => [p.cli, p.env, p.yaml])).toEqual([
      ['--mcp', undefined, 'mcp'],
      ['--env', undefined, 'env'],
      ['--env-path', 'MCP_ENV_PATH', 'env-path'],
      ['--auth-broker-path', 'AUTH_BROKER_PATH', 'auth-broker-path'],
      ['--unsafe', 'MCP_UNSAFE', 'unsafe'],
      ['--browser', 'MCP_BROWSER', 'browser'],
      ['--browser-auth-port', 'MCP_BROWSER_AUTH_PORT', 'browser-auth-port'],
      ['--allow-destination-header', undefined, 'allow-destination-header'],
      ['--connection-type', 'SAP_CONNECTION_TYPE', 'connection-type'],
      ['--system-type', 'SAP_SYSTEM_TYPE', 'system-type'],
    ]);
  });

  describe.each(AUTH_PARAMETERS.map((p) => [p.cli, p] as const))(
    '%s',
    (_n, row) => {
      const p = row as typeof row & { env: string };
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
        expect(fromCli).toEqual({ [p.key]: value });
        expect(fromSpace).toEqual(fromCli);
        if (hasEnv) {
          expect(readAuthParameters([], { [p.env]: envValue }, null)).toEqual(
            fromCli,
          );
        }
        expect(fromYaml).toEqual(fromCli);
      });

      it('CLI beats env beats YAML', () => {
        if (!hasEnv) return;
        if (p.kind === 'flag') {
          // a flag can only be true on the CLI; env false/YAML true shows the order
          expect(
            readAuthParameters(
              [p.cli],
              { [p.env]: 'false' },
              { [p.yaml]: false },
            ),
          ).toEqual({ [p.key]: true });
          expect(
            readAuthParameters([], { [p.env]: 'false' }, { [p.yaml]: true }),
          ).toEqual({ [p.key]: false });
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
        expect(
          readAuthParameters(
            [`${p.cli}=${a}`],
            { [p.env]: b },
            { [p.yaml]: c },
          ),
        ).toEqual({ [p.key]: typed(p, a) });
        expect(readAuthParameters([], { [p.env]: b }, { [p.yaml]: c })).toEqual(
          { [p.key]: typed(p, b) },
        );
      });

      it('absent everywhere is absent', () => {
        expect(readAuthParameters([], {}, {})).not.toHaveProperty(p.key);
      });

      it('is named in the --config template and in the help', () => {
        expect(generateYamlConfigTemplate()).toMatch(
          new RegExp(`^${p.yaml}:`, 'm'),
        );
        const help = ServerConfigManager.generateHelp();
        expect(help).toContain(p.cli);
        if (hasEnv) expect(help).toContain(p.env);
      });
    },
  );
});

describe('--auth-broker is gone in every form', () => {
  it('has no row, no help line, no template key', () => {
    expect(AUTH_PARAMETERS.map((p) => p.cli)).not.toContain('--auth-broker');
    expect(AUTH_PARAMETERS.map((p) => p.yaml)).not.toContain('auth-broker');
    const help = ServerConfigManager.generateHelp();
    expect(help).not.toMatch(/--auth-broker(?!-path)/);
    expect(help).not.toContain(REMOVED_ENV);
    expect(generateYamlConfigTemplate()).not.toMatch(/^auth-broker:/m);
  });

  it.each([
    [['--auth-broker'], {}, undefined, '--auth-broker'],
    [['--auth-broker=true'], {}, undefined, '--auth-broker'],
    [[], { [REMOVED_ENV]: 'true' }, undefined, REMOVED_ENV],
    [[], { [REMOVED_ENV]: 'false' }, undefined, REMOVED_ENV],
    [[], {}, { 'auth-broker': true }, 'auth-broker (config file)'],
    [[], {}, { 'auth-broker': false }, 'auth-broker (config file)'],
  ] as const)(
    'a leftover form stops the start, naming it (%j %j %j)',
    (argv, env, yaml, name) => {
      expect(() => readAuthParameters(argv, { ...env }, yaml as never)).toThrow(
        `${name} was removed in 16.0.0 — remove it from the configuration`,
      );
    },
  );

  it('the parser refuses a leftover form, so the start stops', () => {
    process.argv = ['node', 'server', '--auth-broker'];
    expect(() => ArgumentsParser.parse()).toThrow(
      '--auth-broker was removed in 16.0.0',
    );
    process.argv = ['node', 'server'];
    process.env[REMOVED_ENV] = 'true';
    expect(() => new ServerConfigManager().getConfigSync()).toThrow(
      `${REMOVED_ENV} was removed in 16.0.0`,
    );
  });

  it('a YAML config with the removed key fails validation, naming it', () => {
    const result = validateYamlConfig({ 'auth-broker': true } as never);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'auth-broker (config file) was removed in 16.0.0 — remove it from the configuration',
    );
  });

  it('--auth-broker-path is not mistaken for the removed flag', () => {
    expect(
      readAuthParameters(['--auth-broker-path=/x'], {}, undefined),
    ).toEqual({ authBrokerPath: '/x' });
  });
});

describe('the generated template', () => {
  it('is valid YAML config and sets nothing', () => {
    const config = load(generateYamlConfigTemplate()) as never;
    expect(validateYamlConfig(config).errors).toEqual([]);
    expect(readAuthParameters([], {}, config)).toEqual({
      unsafe: false,
      allowDestinationHeader: false,
    });
  });
});

describe('ports', () => {
  const port = AUTH_PARAMETERS.find((p) => p.key === 'browserAuthPort');
  if (!port) throw new Error('row missing');

  it.each(['abc', '0', '70000', '-1', '12.5'])(
    'refuses %s in each form, naming the form',
    (bad) => {
      expect(() =>
        readAuthParameters([`--browser-auth-port=${bad}`], {}, null),
      ).toThrow(/--browser-auth-port/);
      expect(() =>
        readAuthParameters([], { MCP_BROWSER_AUTH_PORT: bad }, null),
      ).toThrow(/MCP_BROWSER_AUTH_PORT/);
      expect(() =>
        readAuthParameters([], {}, { 'browser-auth-port': bad }),
      ).toThrow(/browser-auth-port/);
      expect(
        validateYamlConfig({ 'browser-auth-port': bad } as never).errors.join(),
      ).toMatch(/browser-auth-port/);
    },
  );

  it('refuses a YAML number out of range', () => {
    expect(() =>
      readAuthParameters([], {}, { 'browser-auth-port': 70000 }),
    ).toThrow(/browser-auth-port/);
    expect(() =>
      readAuthParameters([], {}, { 'browser-auth-port': 0 }),
    ).toThrow(/browser-auth-port/);
  });

  it('accepts 61001 and leaves an absent port undefined', () => {
    expect(
      readAuthParameters(['--browser-auth-port=61001'], {}, null)
        .browserAuthPort,
    ).toBe(61001);
    expect(readAuthParameters([], {}, null).browserAuthPort).toBeUndefined();
  });

  it('refuses a flag-looking next argument as a missing value', () => {
    expect(() =>
      readAuthParameters(['--browser-auth-port', '--unsafe'], {}, null),
    ).toThrow(/--browser-auth-port needs a value/);
  });
});

describe('enums', () => {
  it.each([
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
  ])('%s accepts only its values', (cli, env, yaml, values) => {
    for (const v of values as string[]) {
      expect(
        Object.values(readAuthParameters([`${cli}=${v}`], {}, null)),
      ).toEqual([v]);
    }
    expect(
      Object.values(
        readAuthParameters(
          [`${cli}=RFC`.replace('RFC', (values as string[])[0].toUpperCase())],
          {},
          null,
        ),
      ),
    ).toEqual([(values as string[])[0]]);
    expect(() => readAuthParameters([`${cli}=nope`], {}, null)).toThrow(
      new RegExp(cli),
    );
    expect(() =>
      readAuthParameters([], { [env as string]: 'nope' }, null),
    ).toThrow(new RegExp(env as string));
    expect(() =>
      readAuthParameters([], {}, { [yaml as string]: 'nope' }),
    ).toThrow(new RegExp(yaml as string));
    expect(
      validateYamlConfig({ [yaml as string]: 'nope' } as never).valid,
    ).toBe(false);
  });
});

describe('flags', () => {
  it('refuse a word that is not true or false', () => {
    expect(() => readAuthParameters([], { MCP_UNSAFE: 'yes' }, null)).toThrow(
      /MCP_UNSAFE/,
    );
    expect(() => readAuthParameters([], {}, { unsafe: 'yes' })).toThrow(
      /unsafe/,
    );
  });
});

describe('through the parser and the manager', () => {
  it('--browser, MCP_BROWSER and YAML browser reach IServerConfig.browser', () => {
    process.argv = ['node', 'server', '--browser=firefox'];
    expect(new ServerConfigManager().getConfigSync().browser).toBe('firefox');

    process.argv = ['node', 'server'];
    process.env.MCP_BROWSER = 'edge';
    expect(new ServerConfigManager().getConfigSync().browser).toBe('edge');
  });

  it('env forms reach the config', () => {
    process.env.MCP_BROWSER_AUTH_PORT = '61005';
    const c = new ServerConfigManager().getConfigSync();
    expect(c.browserAuthPort).toBe(61005);
  });

  it('--mcp, --env and --allow-destination-header have no env form', () => {
    process.env.MCP_DESTINATION = 'DEST';
    process.env.MCP_ENV = 'ENVDEST';
    process.env.MCP_ALLOW_DESTINATION_HEADER = 'true';
    const c = new ServerConfigManager().getConfigSync();
    expect(c.mcpDestination).toBeUndefined();
    expect(c.envFile).toBeUndefined();
    expect(c.allowDestinationHeader).toBeFalsy();
    expect(readAuthParameters([], process.env, null)).toEqual({});
    const help = ServerConfigManager.generateHelp();
    for (const n of NO_ENV) expect(help).not.toMatch(new RegExp(`\\b${n}\\b`));
  });

  it('YAML is the lowest source: env beats it, CLI beats env', () => {
    const yaml = {
      mcp: 'FROM_YAML',
      browser: 'chrome',
      'connection-type': 'rfc',
    } as const;
    process.env.MCP_BROWSER = 'edge';
    process.argv = ['node', 'server', '--connection-type=http'];
    applyYamlConfigToArgs({ ...yaml });
    const parsed = ArgumentsParser.parse({ ...yaml });
    expect(parsed.mcp).toBe('FROM_YAML');
    expect(parsed.browser).toBe('edge');
    expect(parsed.connectionType).toBe('http');
  });

  // The parser states the value and its source and leaves the environment
  // alone: written there early, it beat the env file's SAP_SYSTEM_TYPE even
  // from YAML. The launcher sets it after the file (effectiveSystemType).
  it('--system-type: stated with its source, SAP_SYSTEM_TYPE untouched', () => {
    const before = process.env.SAP_SYSTEM_TYPE;
    delete process.env.SAP_SYSTEM_TYPE;
    process.argv = ['node', 'server', '--system-type=onprem'];
    try {
      const parsed = ArgumentsParser.parse();
      expect(parsed.systemType).toBe('onprem');
      expect(parsed.systemTypeSource).toBe('--system-type');
      expect(process.env.SAP_SYSTEM_TYPE).toBeUndefined();
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

  const parse = (yaml?: Record<string, unknown>) =>
    ArgumentsParser.parse(yaml as never);

  it.each([
    [['--env-path=./conn.env'], {}, undefined, '--env-path'],
    [['--env=./conn.env'], {}, undefined, '--env'],
    [[], { MCP_ENV_PATH: './conn.env' }, undefined, 'MCP_ENV_PATH'],
    [[], {}, { 'env-path': './conn.env' }, 'env-path (config file)'],
    [[], {}, { env: './conn.env' }, 'env (config file)'],
    // --env-path wins over --env, as the resolver does
    [
      ['--env=./other.env', '--env-path=./conn.env'],
      {},
      undefined,
      '--env-path',
    ],
  ] as const)('%j %j %j → %s', (argv, env, yaml, source) => {
    process.argv = ['node', 'server', ...argv];
    Object.assign(process.env, env);
    const parsed = parse(yaml);
    expect(parsed.env).toBe(path.resolve(dir, 'conn.env'));
    expect(parsed.envFileSource).toBe(source);
  });

  it.each([[[], {}, undefined]] as const)(
    "the working directory's .env is never read (%j %j %j)",
    (argv, env, yaml) => {
      fs.writeFileSync(
        path.join(dir, '.env'),
        'SAP_URL=https://x.example.test\n',
      );
      process.argv = ['node', 'server', ...argv];
      Object.assign(process.env, env);
      const parsed = parse(yaml);
      expect(parsed.env).toBeUndefined();
      expect(parsed.envFileSource).toBeUndefined();
    },
  );

  it('a relative --env-path still resolves against the working directory', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'SAP_URL=https://x.example.test\n',
    );
    process.argv = ['node', 'server', '--env-path=./.env'];
    expect(parse().env).toBe(path.resolve(dir, '.env'));
  });

  it('no env file → no source', () => {
    expect(parse().envFileSource).toBeUndefined();
  });

  it('reaches IServerConfig through the manager', () => {
    process.argv = ['node', 'server', '--env-path=./conn.env'];
    expect(new ServerConfigManager().getConfigSync().envFileSource).toBe(
      '--env-path',
    );
  });
});
