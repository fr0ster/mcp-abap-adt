/**
 * The destination keys of 24.0.0 — the RFC address (`ashost`, `sysnr`,
 * `mshost`, `msserv`, `sysid`, `group`, `saprouter`), the client and the
 * language — from every source with one precedence: the CLI, then the
 * process's own environment, then the destination's means (its `.env`),
 * then YAML; trimmed; a blank value unset. Read as the start reads them:
 * `readCoreConfig` → `factoryConfigFrom` → `AuthBrokerFactory`.
 *
 * Two destinations in one process keep their own values, and each one's
 * master language of created objects is its own `SAP_LANGUAGE`: no
 * destination's `.env` reaches `process.env`.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import type { DestinationKey, YamlConfig } from '@mcp-abap-adt/lib/config';
import { withDestinationSystemContext } from '../../../../src/lib/requestSystemResolution';
import { getStatedSystemContext } from '../../../../src/lib/systemContext';
import { AuthBrokerFactory } from '../auth/brokerFactory';
import { readCoreConfig } from '../config/coreParameters';
import { factoryConfigFrom } from '../launcher';
import {
  type BrokerBase,
  basicLines,
  brokerBase,
  recordingLogins,
  silentLogger,
} from './helpers/factoryFixture';

/** Each key with its CLI, environment and YAML forms. */
const FORMS: ReadonlyArray<readonly [DestinationKey, string, string, string]> =
  [
    ['ashost', '--ashost', 'SAP_ASHOST', 'ashost'],
    ['sysnr', '--sysnr', 'SAP_SYSNR', 'sysnr'],
    ['mshost', '--mshost', 'SAP_MSHOST', 'mshost'],
    ['msserv', '--msserv', 'SAP_MSSERV', 'msserv'],
    ['sysid', '--sysid', 'SAP_SYSID', 'sysid'],
    ['group', '--group', 'SAP_GROUP', 'group'],
    ['saprouter', '--saprouter', 'SAP_SAPROUTER', 'saprouter'],
    ['client', '--client', 'SAP_CLIENT', 'client'],
    ['language', '--language', 'SAP_LANGUAGE', 'language'],
  ];

let base: BrokerBase;

beforeEach(() => {
  base = brokerBase('destination-keys');
});

afterEach(() => {
  base.remove();
});

/** A destination's `.env`: basic over RFC, no URL and no client, plus `extra`. */
function destinationLines(extra: string[]): string[] {
  return basicLines()
    .filter(
      (line) => !line.startsWith('SAP_CLIENT=') && !line.startsWith('SAP_URL='),
    )
    .map((line) =>
      line === 'SAP_CONNECTION_TYPE=http' ? 'SAP_CONNECTION_TYPE=rfc' : line,
    )
    .concat(extra);
}

/** The factory the start builds from these parameters. */
function factoryOf(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: YamlConfig | null = null,
): AuthBrokerFactory {
  const config = readCoreConfig(
    [`--auth-broker-path=${base.root}`, ...argv],
    env,
    yaml,
  );
  return new AuthBrokerFactory(
    factoryConfigFrom(config, {
      browserStrategy: recordingLogins().browserStrategy,
      promptLogger: silentLogger,
    }),
  );
}

/** `key` in effect for destination `d`, the file stating `fileValue` (or not). */
async function inEffect(
  key: DestinationKey,
  sources: {
    cli?: string;
    env?: string;
    file?: string;
    yaml?: string;
  },
): Promise<string | undefined> {
  const form = FORMS.find(([k]) => k === key);
  if (form === undefined) throw new Error(`no form for ${key}`);
  const [, cli, envName, yamlKey] = form;
  base.writeSession(
    'd',
    destinationLines(
      sources.file === undefined ? [] : [`${envName}=${sources.file}`],
    ),
  );
  const factory = factoryOf(
    sources.cli === undefined ? [] : [`${cli}=${sources.cli}`],
    sources.env === undefined ? {} : { [envName]: sources.env },
    sources.yaml === undefined ? null : { [yamlKey]: sources.yaml },
  );
  return (await factory.destinationKeysFor('d'))[key];
}

for (const [key] of FORMS) {
  describe(format('%s: one precedence for every source', key), () => {
    it('the CLI beats the environment, the file and YAML', async () => {
      assert.equal(
        await inEffect(key, {
          cli: 'from-cli',
          env: 'from-env',
          file: 'from-file',
          yaml: 'from-yaml',
        }),
        'from-cli',
      );
    });

    it("the process's environment beats the destination's .env and YAML", async () => {
      assert.equal(
        await inEffect(key, {
          env: 'from-env',
          file: 'from-file',
          yaml: 'from-yaml',
        }),
        'from-env',
      );
    });

    it("the destination's .env beats YAML", async () => {
      assert.equal(
        await inEffect(key, { file: 'from-file', yaml: 'from-yaml' }),
        'from-file',
      );
    });

    it('YAML alone is read', async () => {
      assert.equal(await inEffect(key, { yaml: 'from-yaml' }), 'from-yaml');
    });

    it('each source is trimmed', async () => {
      assert.equal(await inEffect(key, { cli: '  from-cli  ' }), 'from-cli');
      assert.equal(await inEffect(key, { env: '  from-env  ' }), 'from-env');
      assert.equal(await inEffect(key, { file: '  from-file  ' }), 'from-file');
      // A quoted value keeps its spaces in the file: the factory trims it.
      assert.equal(
        await inEffect(key, { file: '"  from-file  "' }),
        'from-file',
      );
      assert.equal(await inEffect(key, { yaml: '  from-yaml  ' }), 'from-yaml');
    });

    it('a blank value is unset: the next source answers', async () => {
      assert.equal(
        await inEffect(key, {
          env: '   ',
          file: 'from-file',
          yaml: 'from-yaml',
        }),
        'from-file',
      );
      assert.equal(
        await inEffect(key, { file: '   ', yaml: 'from-yaml' }),
        'from-yaml',
      );
      assert.equal(await inEffect(key, { file: '   ' }), undefined);
      assert.equal(
        await inEffect(key, { file: '"   "', yaml: 'from-yaml' }),
        'from-yaml',
      );
    });

    it('stated nowhere: no value, no default', async () => {
      assert.equal(await inEffect(key, {}), undefined);
    });
  });
}

describe('two destinations in one process', () => {
  const A = [
    'SAP_CLIENT=100',
    'SAP_LANGUAGE=DE',
    'SAP_ASHOST=host-a.example.test',
    'SAP_SYSNR=00',
  ];
  const B = [
    'SAP_CLIENT=200',
    'SAP_LANGUAGE=FR',
    'SAP_MSHOST=ms-b.example.test',
    'SAP_SYSID=SYB',
    'SAP_GROUP=GROUP_B',
  ];
  const saved = { ...process.env };

  beforeEach(() => {
    for (const [, , env] of FORMS) delete process.env[env];
    base.writeSession('a', destinationLines(A));
    base.writeSession('b', destinationLines(B));
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('each keeps its own client, language and address; the environment gets none of them', async () => {
    const factory = factoryOf(['--connection-type=rfc'], {});
    assert.deepStrictEqual(await factory.destinationKeysFor('a'), {
      ashost: 'host-a.example.test',
      sysnr: '00',
      client: '100',
      language: 'DE',
    });
    assert.deepStrictEqual(await factory.destinationKeysFor('b'), {
      mshost: 'ms-b.example.test',
      sysid: 'SYB',
      group: 'GROUP_B',
      client: '200',
      language: 'FR',
    });
    assert.deepStrictEqual(await factory.settingsFor('a'), {
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'DE',
      ashost: 'host-a.example.test',
      sysnr: '00',
    });
    assert.deepStrictEqual(await factory.settingsFor('b'), {
      authType: 'basic',
      connectionType: 'rfc',
      client: '200',
      language: 'FR',
      mshost: 'ms-b.example.test',
      group: 'GROUP_B',
      sysid: 'SYB',
    });
    for (const [, , env] of FORMS) assert.equal(process.env[env], undefined);
  });

  it("each one's master language of created objects is its own", async () => {
    const factory = factoryOf([], {});
    const a = await factory.systemContextFor('a');
    const b = await factory.systemContextFor('b');
    assert.equal(a.masterLanguage, 'DE');
    assert.equal(b.masterLanguage, 'FR');
    assert.equal(
      withDestinationSystemContext(
        a,
        () => getStatedSystemContext().masterLanguage,
      ),
      'DE',
    );
    assert.equal(
      withDestinationSystemContext(
        b,
        () => getStatedSystemContext().masterLanguage,
      ),
      'FR',
    );
  });
});
