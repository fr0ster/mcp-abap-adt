/**
 * The destination keys in `mcp-abap-adt`'s table — the RFC address (the
 * application server's and the message server's), the client and the
 * language: the CLI, the environment and YAML forms reach the same
 * `CoreConfig` fields, each with the form it came from, beside
 * `--connection-type` and in its form (`SAP_X` → `--x` → `x`); and in the
 * HTTP and SSE binaries, whose credentials come only from `x-sap-*` headers,
 * their CLI or YAML form stops the start like every other destination option.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { YamlConfig } from '@mcp-abap-adt/lib/config';
import {
  DESTINATION_OPTIONS_REMOVED,
  DESTINATIONS_ELSEWHERE,
  type ParameterTable,
  readParameters,
  validateYamlConfig,
} from '@mcp-abap-adt/lib/config';
import { assertThrows } from '../../../../src/__tests__/helpers/assertions';
import { CORE_PARAMETERS, readCoreConfig } from '../config/coreParameters';
import { coreHelp } from '../launcher';

/** Each field with its three forms. */
const FORMS = [
  ['ashost', '--ashost', 'SAP_ASHOST', 'ashost'],
  ['sysnr', '--sysnr', 'SAP_SYSNR', 'sysnr'],
  ['mshost', '--mshost', 'SAP_MSHOST', 'mshost'],
  ['msserv', '--msserv', 'SAP_MSSERV', 'msserv'],
  ['sysid', '--sysid', 'SAP_SYSID', 'sysid'],
  ['group', '--group', 'SAP_GROUP', 'group'],
  ['saprouter', '--saprouter', 'SAP_SAPROUTER', 'saprouter'],
  ['client', '--client', 'SAP_CLIENT', 'client'],
  ['language', '--language', 'SAP_LANGUAGE', 'language'],
] as const;

const read = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = {},
  yaml: YamlConfig | null = null,
) => readCoreConfig(argv, env, yaml) as unknown as Record<string, unknown>;

describe('the CLI and YAML forms reach the same fields', () => {
  for (const [field, cli, env, yaml] of FORMS) {
    it(format('%s: %s, %s and %s', field, cli, env, yaml), () => {
      const value = '/H/value.example.test/S/3299';
      assert.equal(read([`${cli}=${value}`])[field], value);
      assert.equal(read([cli, value])[field], value);
      assert.equal(read([], { [env]: value })[field], value);
      assert.equal(read([], {}, { [yaml]: value })[field], value);
    });
  }

  for (const [field, cli, env, yaml] of FORMS) {
    it(format('%s: the form it came from is kept', field), () => {
      const sourceOf = (config: ReturnType<typeof readCoreConfig>) =>
        config.destinationKeySource?.[field];
      assert.equal(sourceOf(readCoreConfig([`${cli}=v`], {})), cli);
      assert.equal(sourceOf(readCoreConfig([], { [env]: 'v' })), env);
      assert.equal(
        sourceOf(readCoreConfig([], {}, { [yaml]: 'v' })),
        `${yaml} (config file)`,
      );
    });
  }

  for (const [field, cli, env, yaml] of FORMS) {
    it(format('%s: a blank value is unset', field), () => {
      assert.equal(read([`${cli}=   `])[field], undefined);
      assert.equal(read([], { [env]: '   ' })[field], undefined);
      assert.equal(read([], {}, { [yaml]: '   ' })[field], undefined);
    });
  }

  for (const [field, cli] of FORMS) {
    it(format('%s: trimmed, as every string parameter is', field), () => {
      assert.equal(read([`${cli}=  value-one  `])[field], 'value-one');
    });
  }

  for (const [field, _cli, _env, yaml] of FORMS) {
    it(format('%s: a YAML number is its text', field), () => {
      assert.equal(read([], {}, { [yaml]: 3600 })[field], '3600');
    });
  }

  it('CLI beats the environment, the environment beats YAML', () => {
    const config = read(
      ['--mshost=from-cli'],
      { SAP_MSHOST: 'from-env', SAP_SYSID: 'ENV' },
      { mshost: 'from-yaml', sysid: 'YML', group: 'FROM_YAML' },
    );
    assert.equal(config.mshost, 'from-cli');
    assert.equal(config.sysid, 'ENV');
    assert.equal(config.group, 'FROM_YAML');
  });

  it('none given: none set, no default', () => {
    const config = read([]);
    for (const [field] of FORMS) assert.equal(config[field], undefined);
  });

  it('the help lists every form', () => {
    const help = coreHelp();
    for (const [, cli, env] of FORMS) {
      assert.ok(help.includes(cli));
      assert.ok(help.includes(env));
    }
  });

  it('YAML validation accepts them', () => {
    const yaml = Object.fromEntries(FORMS.map(([, , , y]) => [y, 'v']));
    assert.equal(validateYamlConfig(CORE_PARAMETERS, yaml).valid, true);
  });
});

/** The HTTP and SSE binaries' refusal of destination options, alone. */
const FOREIGN: ParameterTable = {
  program: 'mcp-abap-adt-http',
  rows: [],
  removed: [DESTINATION_OPTIONS_REMOVED],
};

describe("another binary's form of them stops the start as other foreign parameters do", () => {
  for (const [_field, cli] of FORMS) {
    it(format('%s: its CLI form', _field), () => {
      assertThrows(
        () => readParameters(FOREIGN, [`${cli}=value-one`], {}),
        `${cli}: ${DESTINATIONS_ELSEWHERE}`,
      );
      // As --connection-type is.
      assertThrows(
        () => readParameters(FOREIGN, ['--connection-type=rfc'], {}),
        `--connection-type: ${DESTINATIONS_ELSEWHERE}`,
      );
    });
  }

  for (const [_field, _cli, _env, yaml] of FORMS) {
    it(format('%s: its YAML form', _field), () => {
      assertThrows(
        () => readParameters(FOREIGN, [], {}, { [yaml]: 'value-one' }),
        `${yaml} (config file): ${DESTINATIONS_ELSEWHERE}`,
      );
    });
  }

  for (const [_f, _c, env] of FORMS) {
    it(format('%s: its environment form is not read', _f), () => {
      assert.deepStrictEqual(
        readParameters(FOREIGN, [], { [env]: 'value-one' }),
        {},
      );
    });
  }
});
