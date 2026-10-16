/**
 * The message server's parameters in `mcp-abap-adt`'s table: the CLI, the
 * environment and YAML forms reach the same `CoreConfig` fields, beside
 * `--connection-type` and in its form (`SAP_X` → `--x` → `x`); and in the
 * HTTP and SSE binaries, whose credentials come only from `x-sap-*` headers,
 * their CLI or YAML form stops the start like every other destination option.
 */

import {
  DESTINATION_OPTIONS_REMOVED,
  DESTINATIONS_ELSEWHERE,
  type ParameterTable,
  readParameters,
  validateYamlConfig,
} from '@mcp-abap-adt/lib/config';
import { CORE_PARAMETERS, readCoreConfig } from '../config/coreParameters';
import { coreHelp } from '../launcher';

/** Each field with its three forms. */
const FORMS = [
  ['mshost', '--mshost', 'SAP_MSHOST', 'mshost'],
  ['msserv', '--msserv', 'SAP_MSSERV', 'msserv'],
  ['sysid', '--sysid', 'SAP_SYSID', 'sysid'],
  ['group', '--group', 'SAP_GROUP', 'group'],
  ['saprouter', '--saprouter', 'SAP_SAPROUTER', 'saprouter'],
] as const;

const read = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = {},
  yaml: Record<string, unknown> | null = null,
) => readCoreConfig(argv, env, yaml) as unknown as Record<string, unknown>;

describe('the CLI and YAML forms reach the same fields', () => {
  it.each(FORMS)('%s: %s, %s and %s', (field, cli, env, yaml) => {
    const value = '/H/value.example.test/S/3299';
    expect(read([`${cli}=${value}`])[field]).toBe(value);
    expect(read([cli, value])[field]).toBe(value);
    expect(read([], { [env]: value })[field]).toBe(value);
    expect(read([], {}, { [yaml]: value })[field]).toBe(value);
  });

  it.each(FORMS)('%s: trimmed, as every string parameter is', (field, cli) => {
    expect(read([`${cli}=  value-one  `])[field]).toBe('value-one');
  });

  it.each(FORMS)('%s: a YAML number is its text', (field, _cli, _env, yaml) => {
    expect(read([], {}, { [yaml]: 3600 })[field]).toBe('3600');
  });

  it('CLI beats the environment, the environment beats YAML', () => {
    const config = read(
      ['--mshost=from-cli'],
      { SAP_MSHOST: 'from-env', SAP_SYSID: 'ENV' },
      { mshost: 'from-yaml', sysid: 'YML', group: 'FROM_YAML' },
    );
    expect(config.mshost).toBe('from-cli');
    expect(config.sysid).toBe('ENV');
    expect(config.group).toBe('FROM_YAML');
  });

  it('none given: none set, no default', () => {
    const config = read([]);
    for (const [field] of FORMS) expect(config[field]).toBeUndefined();
  });

  it('the help lists every form', () => {
    const help = coreHelp();
    for (const [, cli, env] of FORMS) {
      expect(help).toContain(cli);
      expect(help).toContain(env);
    }
  });

  it('YAML validation accepts them', () => {
    const yaml = Object.fromEntries(FORMS.map(([, , , y]) => [y, 'v']));
    expect(validateYamlConfig(CORE_PARAMETERS, yaml).valid).toBe(true);
  });
});

/** The HTTP and SSE binaries' refusal of destination options, alone. */
const FOREIGN: ParameterTable = {
  program: 'mcp-abap-adt-http',
  rows: [],
  removed: [DESTINATION_OPTIONS_REMOVED],
};

describe("another binary's form of them stops the start as other foreign parameters do", () => {
  it.each(FORMS)('%s: its CLI form', (_field, cli) => {
    expect(() => readParameters(FOREIGN, [`${cli}=value-one`], {})).toThrow(
      `${cli}: ${DESTINATIONS_ELSEWHERE}`,
    );
    // As --connection-type is.
    expect(() =>
      readParameters(FOREIGN, ['--connection-type=rfc'], {}),
    ).toThrow(`--connection-type: ${DESTINATIONS_ELSEWHERE}`);
  });

  it.each(FORMS)('%s: its YAML form', (_field, _cli, _env, yaml) => {
    expect(() =>
      readParameters(FOREIGN, [], {}, { [yaml]: 'value-one' }),
    ).toThrow(`${yaml} (config file): ${DESTINATIONS_ELSEWHERE}`);
  });

  it.each(FORMS)('%s: its environment form is not read', (_f, _c, env) => {
    expect(readParameters(FOREIGN, [], { [env]: 'value-one' })).toEqual({});
  });
});
