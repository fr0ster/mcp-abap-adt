import { load } from 'js-yaml';
import {
  type ParameterTable,
  STATE_IDLE_ROW,
  tlsRows,
} from '../../../lib/config/authParameters';
import {
  generateYamlConfigTemplate as templateOf,
  validateYamlConfig as validateTable,
  type YamlConfig,
} from '../../../lib/config/yamlConfig';

/** A table of lib's shared rows: the secret check holds for every binary's. */
const TABLE: ParameterTable = {
  program: 'any-binary',
  rows: [...tlsRows('http'), STATE_IDLE_ROW],
  removed: [],
};
const validateYamlConfig = (config: YamlConfig) => validateTable(TABLE, config);
const generateYamlConfigTemplate = () => templateOf(TABLE);

const VALUE = 'placeholder-value-not-for-messages';

const errorsFor = (config: Record<string, unknown>): string =>
  validateYamlConfig(config as YamlConfig).errors.join('\n');

describe('YAML holds configuration, never a secret or the session', () => {
  it.each([
    ['password', { password: VALUE }, 'password'],
    ['sap-token', { 'sap-token': VALUE }, 'sap-token'],
    ['Refresh_Token', { Refresh_Token: VALUE }, 'Refresh_Token'],
    ['cookie', { cookie: VALUE }, 'cookie'],
    ['passphrase', { passphrase: VALUE }, 'passphrase'],
    ['credential', { credential: VALUE }, 'credential'],
    [
      'nested client_secret',
      { http: { client_secret: VALUE } },
      'http.client_secret',
    ],
    [
      'two levels down',
      { sse: { tls: { 'ca-passphrase': VALUE } } },
      'sse.tls.ca-passphrase',
    ],
    ['inside a list', { http: { x: [{ token: VALUE }] } }, 'http.x.0.token'],
  ])('refuses %s, naming the key and not the value', (_n, config, key) => {
    const message = errorsFor(config);
    expect(message).toContain(`"${key}"`);
    expect(message).not.toContain(VALUE);
  });

  it('a secret-looking key with a non-string value is still refused', () => {
    expect(errorsFor({ password: 12345 })).toContain('"password"');
  });

  it('passes the generated template and the file-path TLS keys', () => {
    const template = load(generateYamlConfigTemplate()) as YamlConfig;
    expect(validateYamlConfig(template).errors).toEqual([]);
    expect(
      errorsFor({
        http: { tls: { cert: '/c.crt', key: '/k.key', ca: '/ca.crt' } },
      }),
    ).toBe('');
  });
});
