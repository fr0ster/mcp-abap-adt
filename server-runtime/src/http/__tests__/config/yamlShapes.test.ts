/**
 * Nothing stated is ignored: a config file section or value of the wrong
 * shape — a list or a value where a mapping of keys is expected, a mapping
 * or a list where one value is expected — is refused in words naming its
 * key, in every section `mcp-abap-adt-http`'s table reads (the SSE and
 * stdio tables: their own suites). An empty value and YAML null are not
 * given, as before.
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
import { HTTP_PARAMETERS } from '../../config/httpParameters';

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
  for (const [_case, table, text, key] of [
    [
      'http as a list (the finding)',
      HTTP_PARAMETERS,
      'http:\n  - enable-dns-protection: true\n    allowed-hosts: ["localhost:3000"]\n',
      'http',
    ],
    ['http as a value', HTTP_PARAMETERS, 'http: on\n', 'http'],
    [
      'http.tls as a list',
      HTTP_PARAMETERS,
      'http:\n  tls: [a, b]\n',
      'http.tls',
    ],
    [
      'http.tls as a value',
      HTTP_PARAMETERS,
      'http:\n  tls: cert.pem\n',
      'http.tls',
    ],
    [
      'restrictions as a list',
      HTTP_PARAMETERS,
      'restrictions:\n  - deny-actions: DeleteClass\n',
      'restrictions',
    ],
    [
      'restrictions as a value',
      HTTP_PARAMETERS,
      'restrictions: all\n',
      'restrictions',
    ],
  ] satisfies [string, Parameters<typeof errorsOf>[0], string, string][]) {
    it(format('%s', _case), () => {
      const errors = errorsOf(table, text);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(`"${key}"`));
      assert.ok(errors[0].includes('mapping'));
    });
  }
});

describe('a value of the wrong shape is refused, naming its key', () => {
  for (const [_case, table, text, key] of [
    [
      'a port as a mapping',
      HTTP_PARAMETERS,
      'http:\n  port: {a: 1}\n',
      'http.port',
    ],
    [
      'a port as a list',
      HTTP_PARAMETERS,
      'http:\n  port: [3000]\n',
      'http.port',
    ],
    [
      'a host as a list',
      HTTP_PARAMETERS,
      'http:\n  host: [a, b]\n',
      'http.host',
    ],
    [
      'a host as a mapping',
      HTTP_PARAMETERS,
      'http:\n  host: {a: b}\n',
      'http.host',
    ],
    [
      'a list as a mapping',
      HTTP_PARAMETERS,
      'http:\n  allowed-hosts: {a: b}\n',
      'http.allowed-hosts',
    ],
    [
      'a list holding a mapping',
      HTTP_PARAMETERS,
      'http:\n  allowed-hosts: [{a: b}]\n',
      'http.allowed-hosts',
    ],
    [
      'a whole number as a list',
      HTTP_PARAMETERS,
      'shutdown-timeout: [5]\n',
      'shutdown-timeout',
    ],
  ] satisfies [string, Parameters<typeof errorsOf>[0], string, string][]) {
    it(format('%s', _case), () => {
      const errors = errorsOf(table, text);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(key));
    });
  }
});

describe('an empty value and null are not given', () => {
  for (const [_case, table, text] of [
    ['http null', HTTP_PARAMETERS, 'http:\n'],
    ['http empty', HTTP_PARAMETERS, "http: ''\n"],
    ['http.tls null', HTTP_PARAMETERS, 'http:\n  tls:\n'],
    ['restrictions null', HTTP_PARAMETERS, 'restrictions:\n'],
    ['a port null', HTTP_PARAMETERS, 'http:\n  port:\n'],
    ['a host empty', HTTP_PARAMETERS, "http:\n  host: ''\n"],
  ] satisfies [string, Parameters<typeof errorsOf>[0], string][]) {
    it(format('%s', _case), () => {
      assert.deepStrictEqual(errorsOf(table, text), []);
    });
  }

  it('a well-shaped section is read', () => {
    assert.deepStrictEqual(
      errorsOf(
        HTTP_PARAMETERS,
        'http:\n  enable-dns-protection: true\n  allowed-hosts: ["localhost:3000"]\n',
      ),
      [],
    );
  });
});
