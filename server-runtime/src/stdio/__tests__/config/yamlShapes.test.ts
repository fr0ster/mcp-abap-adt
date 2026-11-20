/**
 * Nothing stated is ignored: a config file section or value of the wrong
 * shape — a list or a value where a mapping of keys is expected, a mapping
 * or a list where one value is expected — is refused in words naming its
 * key, in every section `mcp-abap-adt`'s (stdio) table reads. An empty
 * value and YAML null are not given, as before.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  type ParameterTable,
  validateYamlConfig,
  type YamlConfig,
} from '@mcp-abap-adt/lib/config';
import { load } from 'js-yaml';
import { CORE_PARAMETERS } from '../../config/coreParameters';

/** The YAML text as `loadYamlConfig` reads it: its top-level mapping. */
function yaml(text: string): YamlConfig {
  const parsed = load(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('the case is not a mapping');
  }
  return parsed as YamlConfig;
}

const errorsOf = (table: ParameterTable, text: string) =>
  validateYamlConfig(table, yaml(text)).errors;

describe('a section of the wrong shape is refused, naming its key', () => {
  for (const [_case, text, key] of [
    [
      'restrictions as a list',
      'restrictions:\n  - deny-actions: DeleteClass\n',
      'restrictions',
    ],
    ['restrictions as a value', 'restrictions: all\n', 'restrictions'],
  ]) {
    it(format('%s', _case), () => {
      const errors = errorsOf(CORE_PARAMETERS, text);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(`"${key}"`));
      assert.ok(errors[0].includes('mapping'));
    });
  }
});

describe('a value of the wrong shape is refused, naming its key', () => {
  for (const [_case, text, key] of [
    ['a string as a list', 'env: [a, b]\n', 'env'],
    ['an enum as a mapping', 'renewal: {a: b}\n', 'renewal'],
  ]) {
    it(format('%s', _case), () => {
      const errors = errorsOf(CORE_PARAMETERS, text);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(key));
    });
  }
});

describe('an empty value and null are not given', () => {
  for (const [_case, text] of [
    ['restrictions null', 'restrictions:\n'],
    ['restrictions empty', "restrictions: ''\n"],
    ['env empty', "env: ''\n"],
  ]) {
    it(format('%s', _case), () => {
      assert.deepStrictEqual(errorsOf(CORE_PARAMETERS, text), []);
    });
  }
});
