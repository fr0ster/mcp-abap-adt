import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type ParameterTable,
  parametersHelp,
  STATE_IDLE_ROW,
} from '../../../lib/config/authParameters';
import { readStateIdleMinutes } from '../../../lib/config/stateIdleMinutes';
import type { YamlConfig } from '../../../lib/config/yamlConfig';
import {
  generateYamlConfigTemplate as templateOf,
  validateYamlConfig as validateTable,
} from '../../../lib/config/yamlConfig';
import { assertThrows } from '../../helpers/assertions';

/** lib's shared row alone: every binary's table holds it. */
const IDLE: ParameterTable = {
  program: 'any-binary',
  rows: [STATE_IDLE_ROW],
  removed: [],
};
const validateYamlConfig = (config: YamlConfig) => validateTable(IDLE, config);
const generateYamlConfigTemplate = () => templateOf(IDLE);
const rowHelp = () => parametersHelp(IDLE);

const ENV = 'MCP_STATE_IDLE_MINUTES';

describe('stateIdleMinutes — CLI, env, YAML', () => {
  it('defaults to 30', () => {
    assert.equal(readStateIdleMinutes(['node', 'x'], {}, null), 30);
  });

  it('45 is taken in every form; the CLI beats the env, which beats the YAML', () => {
    assert.equal(
      readStateIdleMinutes(['--state-idle-minutes=45'], {}, null),
      45,
    );
    assert.equal(
      readStateIdleMinutes(['--state-idle-minutes', '45'], {}, null),
      45,
    );
    assert.equal(readStateIdleMinutes([], { [ENV]: '45' }, null), 45);
    assert.equal(
      readStateIdleMinutes([], {}, { 'state-idle-minutes': 45 }),
      45,
    );
    assert.equal(
      readStateIdleMinutes(
        ['--state-idle-minutes=60'],
        { [ENV]: '50' },
        { 'state-idle-minutes': 40 },
      ),
      60,
    );
    assert.equal(
      readStateIdleMinutes([], { [ENV]: '50' }, { 'state-idle-minutes': 40 }),
      50,
    );
  });

  // The title shows each value as Jest's %p rendered it: a string quoted.
  for (const v of ['29', '0', '-1', '30.5', 'abc']) {
    it(`${JSON.stringify(v)} is refused at startup, named in the form it was given`, () => {
      assertThrows(
        () => readStateIdleMinutes([`--state-idle-minutes=${v}`], {}, null),
        /--state-idle-minutes.*at least 30/,
      );
      assertThrows(
        () => readStateIdleMinutes([], { [ENV]: v }, null),
        new RegExp(`${ENV}.*at least 30`),
      );
      assertThrows(
        () => readStateIdleMinutes([], {}, { 'state-idle-minutes': v }),
        /state-idle-minutes \(config file\).*at least 30/,
      );
    });
  }

  it('35791 is the maximum: a larger value would overflow the timer and is refused, naming the maximum', () => {
    assert.equal(
      readStateIdleMinutes(['--state-idle-minutes=35791'], {}, null),
      35791,
    );
    assert.equal(readStateIdleMinutes([], { [ENV]: '35791' }, null), 35791);
    assertThrows(
      () => readStateIdleMinutes(['--state-idle-minutes=35792'], {}, null),
      /--state-idle-minutes.*at most 35791/,
    );
    assertThrows(
      () => readStateIdleMinutes([], { [ENV]: '35792' }, null),
      /at most 35791/,
    );
    assertThrows(
      () => readStateIdleMinutes([], {}, { 'state-idle-minutes': 35792 }),
      /state-idle-minutes \(config file\).*at most 35791/,
    );
    assert.equal(
      validateYamlConfig({ 'state-idle-minutes': 35792 } as never).valid,
      false,
    );
    assert.ok(rowHelp().includes('35791'));
  });

  it('a bare --state-idle-minutes says how to give the value', () => {
    assertThrows(
      () => readStateIdleMinutes(['--state-idle-minutes'], {}, null),
      '--state-idle-minutes needs a value: --state-idle-minutes=<minutes>',
    );
  });

  it('a YAML number under 30 or fractional is refused by the YAML validation too', () => {
    for (const v of [29, 0, -1, 30.5, 'abc']) {
      const r = validateYamlConfig({ 'state-idle-minutes': v } as never);
      assert.equal(r.valid, false);
      assert.match(r.errors.join('\n'), /state-idle-minutes/);
    }
    assert.equal(
      validateYamlConfig({ 'state-idle-minutes': 45 } as never).valid,
      true,
    );
  });

  it('the template and the help name the option', () => {
    assert.ok(generateYamlConfigTemplate().includes('state-idle-minutes'));
    const help = rowHelp();
    assert.ok(help.includes('--state-idle-minutes'));
    assert.ok(help.includes(ENV));
  });
});

describe('the help of the row', () => {
  it('the help separates its sentences', () => {
    const help = rowHelp();
    const block = help.slice(help.indexOf('HELD STATE'));
    const text = block
      .slice(0, block.indexOf('env: MCP_STATE_IDLE_MINUTES'))
      .replace(/\s+/g, ' ');
    assert.match(
      text,
      /tool call\. Default and minimum: 30; maximum: 35791; a whole number\. /,
    );
    assert.match(text, /does not count\. $/);
  });
});
