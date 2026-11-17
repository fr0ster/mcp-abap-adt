/**
 * The live tests' destination set-up exports its settings by wire: over HTTP
 * the URL and client; over RFC the stated address, client and language, and
 * no SAP_URL — an RFC destination has none, and the string "undefined" in
 * SAP_URL made the RFC test config refuse it as stating a URL. The set-up
 * answers whether a destination was set up, so the loader no longer reads
 * success from SAP_URL. Nothing is sent: the provider is built, never used.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createTestFactory,
  exportSettings,
  setupAuthBrokerForTests,
} from '../../integration/helpers/authHelpers';

const KEYS = [
  'SAP_URL',
  'SAP_CLIENT',
  'SAP_LANGUAGE',
  'SAP_CONNECTION_TYPE',
  'SAP_ASHOST',
  'SAP_SYSNR',
  'SAP_MSHOST',
  'SAP_MSSERV',
  'SAP_SYSID',
  'SAP_GROUP',
  'SAP_SAPROUTER',
  'MCP_TEST_CONFIG',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('exportSettings', () => {
  it('HTTP: the URL and the client', () => {
    exportSettings({
      url: 'https://system.example.test',
      client: '100',
      authType: 'basic',
    });
    expect(process.env.SAP_URL).toBe('https://system.example.test');
    expect(process.env.SAP_CLIENT).toBe('100');
    expect(process.env.SAP_ASHOST).toBeUndefined();
  });

  it('RFC, an application server: its address, client and language; no SAP_URL', () => {
    process.env.SAP_URL = 'https://left-over.example.test';
    exportSettings({
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'EN',
      ashost: 'host.example.test',
      sysnr: '00',
    });
    expect(process.env.SAP_URL).toBeUndefined();
    expect(process.env.SAP_CONNECTION_TYPE).toBe('rfc');
    expect(process.env.SAP_ASHOST).toBe('host.example.test');
    expect(process.env.SAP_SYSNR).toBe('00');
    expect(process.env.SAP_CLIENT).toBe('100');
    expect(process.env.SAP_LANGUAGE).toBe('EN');
    expect(process.env.SAP_MSHOST).toBeUndefined();
  });

  it('RFC, a message server: its keys, none of the application server', () => {
    exportSettings({
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'EN',
      mshost: 'ms.example.test',
      group: 'G',
      sysid: 'SYX',
      saprouter: '/H/router.example.test/S/3299/H/',
    });
    expect(process.env.SAP_MSHOST).toBe('ms.example.test');
    expect(process.env.SAP_GROUP).toBe('G');
    expect(process.env.SAP_SYSID).toBe('SYX');
    expect(process.env.SAP_SAPROUTER).toBe('/H/router.example.test/S/3299/H/');
    expect(process.env.SAP_ASHOST).toBeUndefined();
    expect(process.env.SAP_URL).toBeUndefined();
  });
});

describe('setupAuthBrokerForTests over RFC', () => {
  it('sets up an RFC destination: answers true, exports its address, no SAP_URL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-export-'));
    try {
      fs.mkdirSync(path.join(dir, 'sessions'));
      fs.writeFileSync(
        path.join(dir, 'sessions', 'STAND.env'),
        [
          'SAP_CONNECTION_TYPE=rfc',
          'SAP_AUTH_TYPE=basic',
          'SAP_USERNAME=placeholder-user',
          'SAP_PASSWORD=placeholder-password',
          'SAP_ASHOST=host.example.test',
          'SAP_SYSNR=00',
          'SAP_CLIENT=100',
          'SAP_LANGUAGE=EN',
          '',
        ].join('\n'),
      );
      const config = path.join(dir, 'test-config.yaml');
      fs.writeFileSync(
        config,
        [
          'auth_broker:',
          `  paths: { service_keys_dir: ${JSON.stringify(dir)} }`,
          '  browser: none',
          'environment:',
          '  env: STAND.env',
          '  system_type: onprem',
          '',
        ].join('\n'),
      );
      process.env.MCP_TEST_CONFIG = config;
      await expect(setupAuthBrokerForTests()).resolves.toBe(true);
      expect(process.env.SAP_URL).toBeUndefined();
      expect(process.env.SAP_ASHOST).toBe('host.example.test');
      expect(process.env.SAP_SYSNR).toBe('00');
      expect(process.env.SAP_LANGUAGE).toBe('EN');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the test factory takes the wire from the test config', () => {
  it("environment.connection_type states it where the destination's file states none", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-wire-'));
    try {
      fs.mkdirSync(path.join(dir, 'sessions'));
      fs.writeFileSync(
        path.join(dir, 'sessions', 'STAND.env'),
        [
          'SAP_URL=https://system.example.test',
          'SAP_AUTH_TYPE=basic',
          'SAP_USERNAME=placeholder-user',
          'SAP_PASSWORD=placeholder-password',
          'SAP_CLIENT=100',
          '',
        ].join('\n'),
      );
      const factory = createTestFactory(
        {
          auth_broker: { paths: { service_keys_dir: dir }, browser: 'none' },
          environment: { system_type: 'onprem', connection_type: 'http' },
        },
        'STAND',
      );
      await expect(factory.settingsFor('STAND')).resolves.toMatchObject({
        url: 'https://system.example.test',
        connectionType: 'http',
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
