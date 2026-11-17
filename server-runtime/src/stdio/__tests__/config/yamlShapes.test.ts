/**
 * Nothing stated is ignored: a config file section or value of the wrong
 * shape — a list or a value where a mapping of keys is expected, a mapping
 * or a list where one value is expected — is refused in words naming its
 * key, in every section `mcp-abap-adt`'s (stdio) table reads. An empty
 * value and YAML null are not given, as before.
 */

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
  it.each([
    [
      'restrictions as a list',
      'restrictions:\n  - deny-actions: DeleteClass\n',
      'restrictions',
    ],
    ['restrictions as a value', 'restrictions: all\n', 'restrictions'],
  ])('%s', (_case, text, key) => {
    const errors = errorsOf(CORE_PARAMETERS, text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`"${key}"`);
    expect(errors[0]).toContain('mapping');
  });
});

describe('a value of the wrong shape is refused, naming its key', () => {
  it.each([
    ['a string as a list', 'env: [a, b]\n', 'env'],
    ['an enum as a mapping', 'renewal: {a: b}\n', 'renewal'],
  ])('%s', (_case, text, key) => {
    const errors = errorsOf(CORE_PARAMETERS, text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(key);
  });
});

describe('an empty value and null are not given', () => {
  it.each([
    ['restrictions null', 'restrictions:\n'],
    ['restrictions empty', "restrictions: ''\n"],
    ['env empty', "env: ''\n"],
  ])('%s', (_case, text) => {
    expect(errorsOf(CORE_PARAMETERS, text)).toEqual([]);
  });
});
