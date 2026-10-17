import {
  type ParameterTable,
  parametersHelp,
  STATE_IDLE_ROW,
} from '../../../lib/config/authParameters';
import { readStateIdleMinutes } from '../../../lib/config/stateIdleMinutes';
import {
  generateYamlConfigTemplate as templateOf,
  validateYamlConfig as validateTable,
} from '../../../lib/config/yamlConfig';

/** lib's shared row alone: every binary's table holds it. */
const IDLE: ParameterTable = {
  program: 'any-binary',
  rows: [STATE_IDLE_ROW],
  removed: [],
};
const validateYamlConfig = (config: Record<string, unknown>) =>
  validateTable(IDLE, config);
const generateYamlConfigTemplate = () => templateOf(IDLE);
const rowHelp = () => parametersHelp(IDLE);

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
    expect(rowHelp()).toContain('35791');
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
    const help = rowHelp();
    expect(help).toContain('--state-idle-minutes');
    expect(help).toContain(ENV);
  });
});

describe('the help of the row', () => {
  it('the help separates its sentences', () => {
    const help = rowHelp();
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
