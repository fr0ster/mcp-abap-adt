/**
 * Nothing stated is ignored: a config file section or value of the wrong
 * shape — a list or a value where a mapping of keys is expected, a mapping
 * or a list where one value is expected — is refused in words naming its
 * key, in every binary's table and every section it reads. An empty value
 * and YAML null are not given, as before.
 */

import {
  type ParameterTable,
  validateYamlConfig,
  type YamlConfig,
} from '@mcp-abap-adt/lib/config';
import { load } from 'js-yaml';
import { SSE_PARAMETERS } from '../../../sse/config/sseParameters';
import { CORE_PARAMETERS } from '../../../stdio/config/coreParameters';
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
  it.each([
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
    ['sse as a list', SSE_PARAMETERS, 'sse:\n  - port: 3001\n', 'sse'],
    ['sse.tls as a value', SSE_PARAMETERS, 'sse:\n  tls: 1\n', 'sse.tls'],
    [
      'restrictions as a list',
      CORE_PARAMETERS,
      'restrictions:\n  - deny-actions: DeleteClass\n',
      'restrictions',
    ],
    [
      'restrictions as a value',
      CORE_PARAMETERS,
      'restrictions: all\n',
      'restrictions',
    ],
  ])('%s', (_case, table, text, key) => {
    const errors = errorsOf(table, text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`"${key}"`);
    expect(errors[0]).toContain('mapping');
  });
});

describe('a value of the wrong shape is refused, naming its key', () => {
  it.each([
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
    ['a string as a list', CORE_PARAMETERS, 'env: [a, b]\n', 'env'],
    ['an enum as a mapping', CORE_PARAMETERS, 'renewal: {a: b}\n', 'renewal'],
    [
      'a whole number as a list',
      HTTP_PARAMETERS,
      'shutdown-timeout: [5]\n',
      'shutdown-timeout',
    ],
  ])('%s', (_case, table, text, key) => {
    const errors = errorsOf(table, text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(key);
  });
});

describe('an empty value and null are not given', () => {
  it.each([
    ['http null', HTTP_PARAMETERS, 'http:\n'],
    ['http empty', HTTP_PARAMETERS, "http: ''\n"],
    ['http.tls null', HTTP_PARAMETERS, 'http:\n  tls:\n'],
    ['restrictions null', CORE_PARAMETERS, 'restrictions:\n'],
    ['a port null', HTTP_PARAMETERS, 'http:\n  port:\n'],
    ['a host empty', HTTP_PARAMETERS, "http:\n  host: ''\n"],
  ])('%s', (_case, table, text) => {
    expect(errorsOf(table, text)).toEqual([]);
  });

  it('a well-shaped section is read', () => {
    expect(
      errorsOf(
        HTTP_PARAMETERS,
        'http:\n  enable-dns-protection: true\n  allowed-hosts: ["localhost:3000"]\n',
      ),
    ).toEqual([]);
  });
});
