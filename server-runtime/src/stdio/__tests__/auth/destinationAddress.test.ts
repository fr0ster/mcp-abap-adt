/**
 * An RFC destination states its own address (24.0.0): the factory's
 * `readSettings` checks what a destination states where it enters the type
 * system, before any connection opens. Each refusal is a
 * `DestinationAddressRefusal` of its case, answered `destination_refused` in
 * its words, keys only; the URL sources follow the matrix — over RFC the
 * destination's own `SAP_URL` / `XSUAA_MCP_URL` refuses it, a service key's
 * URL is not read, the process environment's `SAP_URL` is never read.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { assertRejects } from '../../../../../src/__tests__/helpers/assertions';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  DestinationAddressRefusal,
  destinationFailureOf,
} from '../../auth/destinationFailure';
import type { IAuthBrokerFactoryConfig } from '../../auth/IAuthBrokerFactoryConfig';
import {
  type BrokerBase,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

/** A value that must never reach a refusal. */
const SENTINEL = 'sentinel-value-7f3a';

const BASIC = [
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=placeholder-user',
  'SAP_PASSWORD=placeholder-password',
];
const APP = [`SAP_ASHOST=${SENTINEL}`, 'SAP_SYSNR=00'];
const LOGON = ['SAP_CLIENT=100', 'SAP_LANGUAGE=EN'];

let base: BrokerBase;
const savedUrl = process.env.SAP_URL;

beforeEach(() => {
  base = brokerBase('destination-address');
  delete process.env.SAP_URL;
});

afterEach(() => {
  base.remove();
  if (savedUrl === undefined) delete process.env.SAP_URL;
  else process.env.SAP_URL = savedUrl;
});

function factory(over: Partial<IAuthBrokerFactoryConfig> = {}) {
  return new AuthBrokerFactory(factoryConfig(base, recordingLogins(), over));
}

async function refusalOf(
  lines: string[],
  over: Partial<IAuthBrokerFactoryConfig>,
): Promise<DestinationAddressRefusal> {
  base.writeSession('dest', [...BASIC, ...lines]);
  let thrown: unknown;
  try {
    await factory(over).settingsFor('dest');
  } catch (error) {
    thrown = error;
  }
  if (!(thrown instanceof DestinationAddressRefusal)) {
    throw new Error(`not a DestinationAddressRefusal: ${String(thrown)}`);
  }
  // The answer: destination_refused, its words and a hint; no value.
  const read = destinationFailureOf(thrown);
  assert.equal(read?.error, 'destination_refused');
  assert.equal(read?.message, thrown.message);
  assert.notEqual(read?.hint, undefined);
  assert.ok(!JSON.stringify(read).includes(SENTINEL));
  return thrown;
}

describe('readSettings refuses before any connection opens', () => {
  it('1. HTTP stating an RFC address key: each named', async () => {
    const refusal = await refusalOf(
      [
        `SAP_URL=https://system.example.test`,
        ...APP,
        `SAP_SAPROUTER=${SENTINEL}`,
      ],
      { connectionType: 'http' },
    );
    assert.equal(refusal.case, 'http-with-rfc-keys');
    assert.deepStrictEqual(refusal.keys, [
      'SAP_ASHOST',
      'SAP_SYSNR',
      'SAP_SAPROUTER',
    ]);
    assert.equal(
      refusal.message,
      'Destination "dest" is HTTP and states RFC address keys, which HTTP does not take: SAP_ASHOST, SAP_SYSNR, SAP_SAPROUTER',
    );
  });

  it('1. an RFC key from the start parameters counts as well', async () => {
    base.writeSession('dest', [
      ...BASIC,
      'SAP_URL=https://system.example.test',
    ]);
    let thrown: unknown;
    try {
      await factory({
        connectionType: 'http',
        destinationKeys: { overMeans: { mshost: SENTINEL }, underMeans: {} },
      }).settingsFor('dest');
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof DestinationAddressRefusal);
  });

  it('3. RFC stating SAP_URL in its own .env: refused naming SAP_URL', async () => {
    const refusal = await refusalOf(
      [`SAP_URL=https://${SENTINEL}.example.test`, ...APP, ...LOGON],
      { connectionType: 'rfc' },
    );
    assert.equal(refusal.case, 'rfc-with-url');
    assert.deepStrictEqual(refusal.keys, ['SAP_URL']);
  });

  it('4. two addresses', async () => {
    const refusal = await refusalOf(
      [...APP, `SAP_MSHOST=${SENTINEL}`, ...LOGON],
      { connectionType: 'rfc' },
    );
    assert.equal(refusal.case, 'two-addresses');
  });

  it('5. no address', async () => {
    const refusal = await refusalOf([...LOGON], { connectionType: 'rfc' });
    assert.equal(refusal.case, 'no-address');
  });

  it('6. an incomplete address', async () => {
    const refusal = await refusalOf([`SAP_ASHOST=${SENTINEL}`, ...LOGON], {
      connectionType: 'rfc',
    });
    assert.equal(refusal.case, 'incomplete-address');
    assert.deepStrictEqual(refusal.keys, ['SAP_SYSNR']);
  });

  it('7. no client and no language: both named', async () => {
    const refusal = await refusalOf([...APP], { connectionType: 'rfc' });
    assert.equal(refusal.case, 'logon-incomplete');
    assert.deepStrictEqual(refusal.keys, ['SAP_CLIENT', 'SAP_LANGUAGE']);
  });

  it('8. ABAP Cloud over RFC', async () => {
    const refusal = await refusalOf([...APP, ...LOGON], {
      connectionType: 'rfc',
      systemType: 'cloud',
    });
    assert.equal(refusal.case, 'cloud-over-rfc');
    assert.deepStrictEqual(refusal.keys, [
      'SAP_SYSTEM_TYPE',
      'SAP_CONNECTION_TYPE',
    ]);
  });

  it('a step with faults of two steps answers the earlier one only', async () => {
    const refusal = await refusalOf(
      [`SAP_URL=https://${SENTINEL}.example.test`, `SAP_ASHOST=${SENTINEL}`],
      { connectionType: 'rfc', systemType: 'cloud' },
    );
    assert.equal(refusal.case, 'rfc-with-url');
  });

  it('no connection type: refused naming it, before the settings are built', async () => {
    base.writeSession('dest', [...BASIC, ...APP, ...LOGON]);
    const config = factoryConfig(base, recordingLogins());
    const { connectionType: _dropped, ...withoutWire } = config;
    await assertRejects(
      new AuthBrokerFactory(withoutWire).settingsFor('dest'),
      'SAP_CONNECTION_TYPE',
    );
  });
});

describe('the URL sources of an RFC destination', () => {
  it('XSUAA_MCP_URL in sessions/<name>.env of an XSUAA key: refused naming it', async () => {
    base.writeFile('service-keys/dest.json', [
      JSON.stringify({
        url: 'https://uaa.example.test',
        clientid: 'xs-client-id',
        clientsecret: 'xs-client-secret',
      }),
    ]);
    base.writeSession('dest', [
      `XSUAA_MCP_URL=https://${SENTINEL}.example.test`,
      ...APP,
      ...LOGON,
    ]);
    let thrown: unknown;
    try {
      await factory({ connectionType: 'rfc' }).settingsFor('dest');
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof DestinationAddressRefusal);
    if (!(thrown instanceof DestinationAddressRefusal)) return;
    assert.equal(thrown.case, 'rfc-with-url');
    assert.deepStrictEqual(thrown.keys, ['XSUAA_MCP_URL']);
  });

  it("an ABAP service key's url is not read over RFC", async () => {
    base.writeFile('service-keys/dest.json', [
      JSON.stringify({
        url: 'https://system.example.test',
        abap: { url: 'https://system.example.test', client: '100' },
        uaa: {
          url: 'https://uaa.example.test',
          clientid: 'client-id',
          clientsecret: 'client-secret',
        },
      }),
    ]);
    base.writeSession('dest', [...BASIC, ...APP, ...LOGON]);
    const settings = await factory({ connectionType: 'rfc' }).settingsFor(
      'dest',
    );
    assert.equal(Object.hasOwn(settings, 'url'), false);
    assert.equal(settings.connectionType, 'rfc');
  });

  it("the process environment's SAP_URL is never read: RFC is served, HTTP is refused", async () => {
    process.env.SAP_URL = 'https://from-environment.example.test';
    base.writeSession('dest', [...BASIC, ...APP, ...LOGON]);
    const settings = await factory({ connectionType: 'rfc' }).settingsFor(
      'dest',
    );
    assert.equal(Object.hasOwn(settings, 'url'), false);
    base.writeSession('http', [...BASIC]);
    await assertRejects(
      factory({ connectionType: 'http' }).settingsFor('http'),
      'SAP_URL',
    );
  });

  it('a blank SAP_URL is no URL: RFC is served', async () => {
    base.writeSession('dest', [...BASIC, 'SAP_URL=   ', ...APP, ...LOGON]);
    const settings = await factory({ connectionType: 'rfc' }).settingsFor(
      'dest',
    );
    assert.equal(settings.connectionType, 'rfc');
  });
});

describe('a complete RFC destination', () => {
  it('readSettings answers its ISapRfcConfig: the address, client and language as stated', async () => {
    base.writeSession('dest', [
      ...BASIC,
      'SAP_ASHOST=host.example.test',
      'SAP_SYSNR=00',
      'SAP_SAPROUTER=/H/router.example.test/S/3299/H/',
      ...LOGON,
    ]);
    assert.deepStrictEqual(
      await factory({ connectionType: 'rfc' }).settingsFor('dest'),
      {
        authType: 'basic',
        connectionType: 'rfc',
        client: '100',
        language: 'EN',
        saprouter: '/H/router.example.test/S/3299/H/',
        ashost: 'host.example.test',
        sysnr: '00',
      },
    );
  });
});

describe('what a destination states is checked before its authentication is served', () => {
  const CERTIFICATE = [
    'SAP_CONNECTION_TYPE=rfc',
    'SAP_AUTH_TYPE=certificate',
    'SAP_ASHOST=host.example.test',
    'SAP_SYSNR=00',
    'SAP_CLIENT=100',
    'SAP_LANGUAGE=EN',
    'SAP_USERNAME=test',
    'SAP_PASSWORD=placeholder',
  ];

  async function thrownBy(lines: string[]): Promise<unknown> {
    base.writeSession('dest', lines);
    try {
      await factory({ connectionType: 'rfc' }).settingsFor('dest');
    } catch (error) {
      return error;
    }
    throw new Error('expected a refusal');
  }

  it('9. a client certificate over RFC: refused in its case, naming both keys', async () => {
    const thrown = await thrownBy(CERTIFICATE);
    assert.ok(thrown instanceof DestinationAddressRefusal);
    if (!(thrown instanceof DestinationAddressRefusal)) return;
    assert.equal(thrown.case, 'certificate-over-rfc');
    assert.deepStrictEqual(thrown.keys, [
      'SAP_AUTH_TYPE',
      'SAP_CONNECTION_TYPE',
    ]);
  });

  it('9 with 3: the URL answers first', async () => {
    const thrown = await thrownBy([
      ...CERTIFICATE,
      'SAP_URL=https://sentinel.example.test',
    ]);
    assert.ok(thrown instanceof DestinationAddressRefusal);
    if (!(thrown instanceof DestinationAddressRefusal)) return;
    assert.equal(thrown.case, 'rfc-with-url');
    assert.deepStrictEqual(thrown.keys, ['SAP_URL']);
  });
});

describe('an XSUAA-shaped destination over RFC: every URL key of its file refuses it', () => {
  const XSUAA_LINES = [
    'XSUAA_AUTH_TYPE=basic',
    'XSUAA_ASHOST=host.example.test',
    'XSUAA_SYSNR=00',
    'XSUAA_CLIENT=100',
    'XSUAA_LANGUAGE=EN',
  ];

  beforeEach(() => {
    base.writeFile('service-keys/dest.json', [
      JSON.stringify({
        url: 'https://uaa.example.test',
        clientid: 'placeholder',
        clientsecret: 'placeholder',
      }),
    ]);
  });

  async function refusedKeys(lines: string[]): Promise<readonly string[]> {
    base.writeSession('dest', lines);
    let thrown: unknown;
    try {
      await factory({ connectionType: 'rfc' }).settingsFor('dest');
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof DestinationAddressRefusal)) {
      throw new Error(`not a DestinationAddressRefusal: ${String(thrown)}`);
    }
    assert.equal(thrown.case, 'rfc-with-url');
    return thrown.keys;
  }

  it('SAP_URL in its file: refused naming SAP_URL', async () => {
    assert.deepStrictEqual(
      await refusedKeys([
        'SAP_URL=https://sentinel.example.test',
        ...XSUAA_LINES,
      ]),
      ['SAP_URL'],
    );
  });

  it('SAP_URL and XSUAA_MCP_URL: both named in one refusal', async () => {
    assert.deepStrictEqual(
      await refusedKeys([
        'SAP_URL=https://sentinel.example.test',
        'XSUAA_MCP_URL=https://sentinel.example.test',
        ...XSUAA_LINES,
      ]),
      ['SAP_URL', 'XSUAA_MCP_URL'],
    );
  });
});
