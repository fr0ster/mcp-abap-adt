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

  it('35791 is the maximum: a larger value would overflow the timer and is refused, naming the maximum', () => {
    expect(readStateIdleMinutes(['--state-idle-minutes=35791'], {}, null)).toBe(
      35791,
    );
    expect(readStateIdleMinutes([], { [ENV]: '35791' }, null)).toBe(35791);
    expect(() =>
      readStateIdleMinutes(['--state-idle-minutes=35792'], {}, null),
    ).toThrow(/--state-idle-minutes.*at most 35791/);
    expect(() => readStateIdleMinutes([], { [ENV]: '35792' }, null)).toThrow(
      /at most 35791/,
    );
    expect(() =>
      readStateIdleMinutes([], {}, { 'state-idle-minutes': 35792 }),
    ).toThrow(/state-idle-minutes \(config file\).*at most 35791/);
    expect(
      validateYamlConfig({ 'state-idle-minutes': 35792 } as never).valid,
    ).toBe(false);
    expect(ServerConfigManager.generateHelp()).toContain('35791');
  });

  it('a bare --state-idle-minutes says how to give the value', () => {
    expect(() =>
      readStateIdleMinutes(['--state-idle-minutes'], {}, null),
    ).toThrow(
      '--state-idle-minutes needs a value: --state-idle-minutes=<minutes>',
    );
  });

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

describe('ArgumentsParser reads stateIdleMinutes like its neighbours', () => {
  const ORIG_ARGV = process.argv;
  const ORIG = process.env[ENV];
  afterEach(() => {
    process.argv = ORIG_ARGV;
    if (ORIG === undefined) delete process.env[ENV];
    else process.env[ENV] = ORIG;
  });
  it('CLI, env and YAML reach the parsed arguments', () => {
    const { ArgumentsParser } = require('../../../lib/config/ArgumentsParser');
    delete process.env[ENV];
    process.argv = ['node', 'x', '--state-idle-minutes=50'];
    expect(ArgumentsParser.parse().stateIdleMinutes).toBe(50);
    process.argv = ['node', 'x'];
    process.env[ENV] = '40';
    expect(ArgumentsParser.parse().stateIdleMinutes).toBe(40);
    delete process.env[ENV];
    expect(
      ArgumentsParser.parse({ 'state-idle-minutes': 35 } as never)
        .stateIdleMinutes,
    ).toBe(35);
    expect(ArgumentsParser.parse().stateIdleMinutes).toBe(30);
  });
  it('the help separates its sentences', () => {
    const help = ServerConfigManager.generateHelp();
    const block = help.slice(help.indexOf('HELD STATE'));
    const text = block
      .slice(0, block.indexOf('env: MCP_STATE_IDLE_MINUTES'))
      .replace(/\s+/g, ' ');
    expect(text).toMatch(
      /tool call\. Default and minimum: 30; maximum: 35791; a whole number\. /,
    );
    expect(text).toMatch(/does not count\. $/);
  });
});
