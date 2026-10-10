import { ServerConfigManager } from '../../../lib/config/ServerConfigManager';
import { readStateIdleMinutes } from '../../../lib/config/stateIdleMinutes';
import {
  generateYamlConfigTemplate,
  validateYamlConfig,
} from '../../../lib/config/yamlConfig';

const ENV = 'MCP_STATE_IDLE_MINUTES';

describe('stateIdleMinutes — CLI, env, YAML', () => {
  it('defaults to 30', () => {
    expect(readStateIdleMinutes(['node', 'x'], {}, null)).toBe(30);
  });

  it('45 is taken in every form; the CLI beats the env, which beats the YAML', () => {
    expect(readStateIdleMinutes(['--state-idle-minutes=45'], {}, null)).toBe(
      45,
    );
    expect(readStateIdleMinutes(['--state-idle-minutes', '45'], {}, null)).toBe(
      45,
    );
    expect(readStateIdleMinutes([], { [ENV]: '45' }, null)).toBe(45);
    expect(readStateIdleMinutes([], {}, { 'state-idle-minutes': 45 })).toBe(45);
    expect(
      readStateIdleMinutes(
        ['--state-idle-minutes=60'],
        { [ENV]: '50' },
        { 'state-idle-minutes': 40 },
      ),
    ).toBe(60);
    expect(
      readStateIdleMinutes([], { [ENV]: '50' }, { 'state-idle-minutes': 40 }),
    ).toBe(50);
  });

  it.each(['29', '0', '-1', '30.5', 'abc'])(
    '%p is refused at startup, named in the form it was given',
    (v) => {
      expect(() =>
        readStateIdleMinutes([`--state-idle-minutes=${v}`], {}, null),
      ).toThrow(/--state-idle-minutes.*at least 30/);
      expect(() => readStateIdleMinutes([], { [ENV]: v }, null)).toThrow(
        new RegExp(`${ENV}.*at least 30`),
      );
      expect(() =>
        readStateIdleMinutes([], {}, { 'state-idle-minutes': v }),
      ).toThrow(/state-idle-minutes \(config file\).*at least 30/);
    },
  );

  it('a YAML number under 30 or fractional is refused by the YAML validation too', () => {
    for (const v of [29, 0, -1, 30.5, 'abc']) {
      const r = validateYamlConfig({ 'state-idle-minutes': v } as never);
      expect(r.valid).toBe(false);
      expect(r.errors.join('\n')).toMatch(/state-idle-minutes/);
    }
    expect(
      validateYamlConfig({ 'state-idle-minutes': 45 } as never).valid,
    ).toBe(true);
  });

  it('the template and the help name the option', () => {
    expect(generateYamlConfigTemplate()).toContain('state-idle-minutes');
    const help = ServerConfigManager.generateHelp();
    expect(help).toContain('--state-idle-minutes');
    expect(help).toContain(ENV);
  });
});

describe('ServerConfigManager carries stateIdleMinutes', () => {
  const ORIG_ARGV = process.argv;
  const ORIG = process.env[ENV];
  afterEach(() => {
    process.argv = ORIG_ARGV;
    if (ORIG === undefined) delete process.env[ENV];
    else process.env[ENV] = ORIG;
  });

  it('30 by default, the given value otherwise, and a refusal for 29', () => {
    delete process.env[ENV];
    process.argv = ['node', 'x'];
    expect(new ServerConfigManager().getConfigSync().stateIdleMinutes).toBe(30);
    process.argv = ['node', 'x', '--state-idle-minutes=45'];
    expect(new ServerConfigManager().getConfigSync().stateIdleMinutes).toBe(45);
    process.argv = ['node', 'x', '--state-idle-minutes=29'];
    expect(() => new ServerConfigManager().getConfigSync()).toThrow(
      /at least 30/,
    );
  });
});
