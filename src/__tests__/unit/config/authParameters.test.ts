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

const ENV_NAMES = AUTH_PARAMETERS.map((p) => p.env);
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
  it('has the eleven rows of the spec', () => {
    expect(AUTH_PARAMETERS.map((p) => p.cli)).toEqual([
      '--mcp',
      '--env',
      '--env-path',
      '--auth-broker',
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
      ['--mcp', 'MCP_DESTINATION', 'mcp'],
      ['--env', 'MCP_ENV', 'env'],
      ['--env-path', 'MCP_ENV_PATH', 'env-path'],
      ['--auth-broker', 'MCP_USE_AUTH_BROKER', 'auth-broker'],
      ['--auth-broker-path', 'AUTH_BROKER_PATH', 'auth-broker-path'],
      ['--unsafe', 'MCP_UNSAFE', 'unsafe'],
      ['--browser', 'MCP_BROWSER', 'browser'],
      ['--browser-auth-port', 'MCP_BROWSER_AUTH_PORT', 'browser-auth-port'],
      [
        '--allow-destination-header',
        'MCP_ALLOW_DESTINATION_HEADER',
        'allow-destination-header',
      ],
      ['--connection-type', 'SAP_CONNECTION_TYPE', 'connection-type'],
      ['--system-type', 'SAP_SYSTEM_TYPE', 'system-type'],
    ]);
  });

  describe.each(AUTH_PARAMETERS.map((p) => [p.cli, p] as const))(
    '%s',
    (_n, p) => {
      const value = p.kind === 'flag' ? true : typed(p, sample(p));
      const cliArgs = p.kind === 'flag' ? [p.cli] : [`${p.cli}=${sample(p)}`];
      const envValue = p.kind === 'flag' ? 'true' : sample(p);

      it('CLI, env and YAML alone give the same field', () => {
        const fromCli = readAuthParameters(cliArgs, {}, null);
        const fromSpace =
          p.kind === 'flag'
            ? fromCli
            : readAuthParameters([p.cli, sample(p)], {}, null);
        const fromEnv = readAuthParameters([], { [p.env]: envValue }, null);
        const fromYaml = readAuthParameters([], {}, { [p.yaml]: value });
        expect(fromCli).toEqual({ [p.key]: value });
        expect(fromSpace).toEqual(fromCli);
        expect(fromEnv).toEqual(fromCli);
        expect(fromYaml).toEqual(fromCli);
      });

      it('CLI beats env beats YAML', () => {
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
        expect(help).toContain(p.env);
      });
    },
  );
});

describe('the generated template', () => {
  it('is valid YAML config and sets nothing', () => {
    const config = load(generateYamlConfigTemplate()) as never;
    expect(validateYamlConfig(config).errors).toEqual([]);
    expect(readAuthParameters([], {}, config)).toEqual({
      useAuthBroker: false,
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

  it('new env forms reach the config', () => {
    process.env.MCP_DESTINATION = 'DEST';
    process.env.MCP_ALLOW_DESTINATION_HEADER = 'true';
    process.env.MCP_BROWSER_AUTH_PORT = '61005';
    const c = new ServerConfigManager().getConfigSync();
    expect(c.mcpDestination).toBe('DEST');
    expect(c.allowDestinationHeader).toBe(true);
    expect(c.browserAuthPort).toBe(61005);
  });

  it('YAML is the lowest source: env beats it, CLI beats env', () => {
    const yaml = {
      mcp: 'FROM_YAML',
      browser: 'chrome',
      'connection-type': 'rfc',
    } as const;
    process.env.MCP_DESTINATION = 'FROM_ENV';
    process.argv = ['node', 'server', '--browser=none'];
    applyYamlConfigToArgs({ ...yaml });
    const parsed = ArgumentsParser.parse({ ...yaml });
    expect(parsed.mcp).toBe('FROM_ENV');
    expect(parsed.browser).toBe('none');
    expect(parsed.connectionType).toBe('rfc');
  });

  it('--system-type still sets SAP_SYSTEM_TYPE', () => {
    const before = process.env.SAP_SYSTEM_TYPE;
    process.argv = ['node', 'server', '--system-type=onprem'];
    try {
      expect(ArgumentsParser.parse().systemType).toBe('onprem');
      expect(process.env.SAP_SYSTEM_TYPE).toBe('onprem');
    } finally {
      if (before === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = before;
    }
  });
});
