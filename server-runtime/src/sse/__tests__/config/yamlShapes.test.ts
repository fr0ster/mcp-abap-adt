/**
 * Nothing stated is ignored: a config file section or value of the wrong
 * shape — a list or a value where a mapping of keys is expected, a mapping
 * or a list where one value is expected — is refused in words naming its
 * key, in every section `mcp-abap-adt-sse`'s table reads. An empty value
 * and YAML null are not given, as before.
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
import { SSE_PARAMETERS } from '../../config/sseParameters';

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
    ['sse as a list', 'sse:\n  - port: 3001\n', 'sse'],
    ['sse as a value', 'sse: on\n', 'sse'],
    ['sse.tls as a value', 'sse:\n  tls: 1\n', 'sse.tls'],
    [
      'restrictions as a list',
      'restrictions:\n  - deny-actions: DeleteClass\n',
      'restrictions',
    ],
  ]) {
    it(format('%s', _case), () => {
      const errors = errorsOf(SSE_PARAMETERS, text);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(`"${key}"`));
      assert.ok(errors[0].includes('mapping'));
    });
  }
});

describe('a value of the wrong shape is refused, naming its key', () => {
  for (const [_case, text, key] of [
    ['a port as a list', 'sse:\n  port: [3001]\n', 'sse.port'],
    ['a host as a mapping', 'sse:\n  host: {a: b}\n', 'sse.host'],
    [
      'a list as a mapping',
      'sse:\n  allowed-hosts: {a: b}\n',
      'sse.allowed-hosts',
    ],
  ]) {
    it(format('%s', _case), () => {
      const errors = errorsOf(SSE_PARAMETERS, text);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(key));
    });
  }
});

describe('an empty value and null are not given', () => {
  for (const [_case, text] of [
    ['sse null', 'sse:\n'],
    ['sse empty', "sse: ''\n"],
    ['sse.tls null', 'sse:\n  tls:\n'],
  ]) {
    it(format('%s', _case), () => {
      assert.deepStrictEqual(errorsOf(SSE_PARAMETERS, text), []);
    });
  }
});
