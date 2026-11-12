/**
 * An RFC destination states its own address (24.0.0): the factory's
 * `readSettings` checks what a destination states where it enters the type
 * system, before any connection opens. Each refusal is a
 * `DestinationAddressRefusal` of its case, answered `destination_refused` in
 * its words, keys only; the URL sources follow the matrix — over RFC the
 * destination's own `SAP_URL` / `XSUAA_MCP_URL` refuses it, a service key's
 * URL is not read, the process environment's `SAP_URL` is never read.
 */

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
  expect(read?.error).toBe('destination_refused');
  expect(read?.message).toBe(thrown.message);
  expect(read?.hint).toBeDefined();
  expect(JSON.stringify(read)).not.toContain(SENTINEL);
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
    expect(refusal.case).toBe('http-with-rfc-keys');
    expect(refusal.keys).toEqual(['SAP_ASHOST', 'SAP_SYSNR', 'SAP_SAPROUTER']);
    expect(refusal.message).toBe(
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
    expect(thrown).toBeInstanceOf(DestinationAddressRefusal);
  });

  it('3. RFC stating SAP_URL in its own .env: refused naming SAP_URL', async () => {
    const refusal = await refusalOf(
      [`SAP_URL=https://${SENTINEL}.example.test`, ...APP, ...LOGON],
      { connectionType: 'rfc' },
    );
    expect(refusal.case).toBe('rfc-with-url');
    expect(refusal.keys).toEqual(['SAP_URL']);
  });

  it('4. two addresses', async () => {
    const refusal = await refusalOf(
      [...APP, `SAP_MSHOST=${SENTINEL}`, ...LOGON],
      { connectionType: 'rfc' },
    );
    expect(refusal.case).toBe('two-addresses');
  });

  it('5. no address', async () => {
    const refusal = await refusalOf([...LOGON], { connectionType: 'rfc' });
    expect(refusal.case).toBe('no-address');
  });

  it('6. an incomplete address', async () => {
    const refusal = await refusalOf([`SAP_ASHOST=${SENTINEL}`, ...LOGON], {
      connectionType: 'rfc',
    });
    expect(refusal.case).toBe('incomplete-address');
    expect(refusal.keys).toEqual(['SAP_SYSNR']);
  });

  it('7. no client and no language: both named', async () => {
    const refusal = await refusalOf([...APP], { connectionType: 'rfc' });
    expect(refusal.case).toBe('logon-incomplete');
    expect(refusal.keys).toEqual(['SAP_CLIENT', 'SAP_LANGUAGE']);
  });

  it('8. ABAP Cloud over RFC', async () => {
    const refusal = await refusalOf([...APP, ...LOGON], {
      connectionType: 'rfc',
      systemType: 'cloud',
    });
    expect(refusal.case).toBe('cloud-over-rfc');
    expect(refusal.keys).toEqual(['SAP_SYSTEM_TYPE', 'SAP_CONNECTION_TYPE']);
  });

  it('a step with faults of two steps answers the earlier one only', async () => {
    const refusal = await refusalOf(
      [`SAP_URL=https://${SENTINEL}.example.test`, `SAP_ASHOST=${SENTINEL}`],
      { connectionType: 'rfc', systemType: 'cloud' },
    );
    expect(refusal.case).toBe('rfc-with-url');
  });

  it('no connection type: refused naming it, before the settings are built', async () => {
    base.writeSession('dest', [...BASIC, ...APP, ...LOGON]);
    const config = factoryConfig(base, recordingLogins());
    const { connectionType: _dropped, ...withoutWire } = config;
    await expect(
      new AuthBrokerFactory(withoutWire).settingsFor('dest'),
    ).rejects.toThrow('SAP_CONNECTION_TYPE');
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
    expect(thrown).toBeInstanceOf(DestinationAddressRefusal);
    if (!(thrown instanceof DestinationAddressRefusal)) return;
    expect(thrown.case).toBe('rfc-with-url');
    expect(thrown.keys).toEqual(['XSUAA_MCP_URL']);
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
    expect(Object.hasOwn(settings, 'url')).toBe(false);
    expect(settings.connectionType).toBe('rfc');
  });

  it("the process environment's SAP_URL is never read: RFC is served, HTTP is refused", async () => {
    process.env.SAP_URL = 'https://from-environment.example.test';
    base.writeSession('dest', [...BASIC, ...APP, ...LOGON]);
    const settings = await factory({ connectionType: 'rfc' }).settingsFor(
      'dest',
    );
    expect(Object.hasOwn(settings, 'url')).toBe(false);
    base.writeSession('http', [...BASIC]);
    await expect(
      factory({ connectionType: 'http' }).settingsFor('http'),
    ).rejects.toThrow('SAP_URL');
  });

  it('a blank SAP_URL is no URL: RFC is served', async () => {
    base.writeSession('dest', [...BASIC, 'SAP_URL=   ', ...APP, ...LOGON]);
    const settings = await factory({ connectionType: 'rfc' }).settingsFor(
      'dest',
    );
    expect(settings.connectionType).toBe('rfc');
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
    expect(
      await factory({ connectionType: 'rfc' }).settingsFor('dest'),
    ).toEqual({
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'EN',
      saprouter: '/H/router.example.test/S/3299/H/',
      ashost: 'host.example.test',
      sysnr: '00',
    });
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
    expect(thrown).toBeInstanceOf(DestinationAddressRefusal);
    if (!(thrown instanceof DestinationAddressRefusal)) return;
    expect(thrown.case).toBe('certificate-over-rfc');
    expect(thrown.keys).toEqual(['SAP_AUTH_TYPE', 'SAP_CONNECTION_TYPE']);
  });

  it('9 with 3: the URL answers first', async () => {
    const thrown = await thrownBy([
      ...CERTIFICATE,
      'SAP_URL=https://sentinel.example.test',
    ]);
    expect(thrown).toBeInstanceOf(DestinationAddressRefusal);
    if (!(thrown instanceof DestinationAddressRefusal)) return;
    expect(thrown.case).toBe('rfc-with-url');
    expect(thrown.keys).toEqual(['SAP_URL']);
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
    expect(thrown.case).toBe('rfc-with-url');
    return thrown.keys;
  }

  it('SAP_URL in its file: refused naming SAP_URL', async () => {
    expect(
      await refusedKeys([
        'SAP_URL=https://sentinel.example.test',
        ...XSUAA_LINES,
      ]),
    ).toEqual(['SAP_URL']);
  });

  it('SAP_URL and XSUAA_MCP_URL: both named in one refusal', async () => {
    expect(
      await refusedKeys([
        'SAP_URL=https://sentinel.example.test',
        'XSUAA_MCP_URL=https://sentinel.example.test',
        ...XSUAA_LINES,
      ]),
    ).toEqual(['SAP_URL', 'XSUAA_MCP_URL']);
  });
});
