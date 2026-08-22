import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applySystemEnv,
  MANAGED_SAP_ENV_KEYS,
} from '../../lib/systems/activeSystem';
import {
  describeSystemFile,
  discoverSystems,
  publicSystemInfo,
  resolveSystemRef,
  systemNameFromFileName,
} from '../../lib/systems/envSystems';

const KALOG_ENV = [
  'SAP_URL=http://172.16.2.111:8030',
  'SAP_CLIENT=100',
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=abapsupport',
  'SAP_PASSWORD=secret-kalog',
  'SAP_CONNECTION_TYPE=rfc',
  'SAP_SYSTEM_TYPE=legacy',
  'SAP_MASTER_SYSTEM=KAD',
  'SAP_SAPROUTER=/H/sr2.example.com/H/',
].join('\n');

const CLOUD_ENV = [
  '# a cloud profile',
  'SAP_URL=https://cloud.example.com',
  'SAP_CLIENT=100',
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=cloud_user',
  'SAP_PASSWORD=secret-cloud',
].join('\n');

describe('systemNameFromFileName', () => {
  it.each([
    ['.env', 'default'],
    ['.env.kalog', 'kalog'],
    ['.env.swi.sim', 'swi.sim'],
    ['kalog.env', 'kalog'],
  ])('maps %s to %s', (fileName, expected) => {
    expect(systemNameFromFileName(fileName)).toBe(expected);
  });

  it.each([
    'env',
    'readme.md',
    'envfile',
    '.envrc',
  ])('ignores %s', (fileName) => {
    expect(systemNameFromFileName(fileName)).toBeUndefined();
  });
});

describe('discoverSystems', () => {
  let dir: string;
  const originalSystemsPath = process.env.MCP_SYSTEMS_PATH;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-systems-'));
    fs.writeFileSync(path.join(dir, '.env.kalog'), KALOG_ENV);
    fs.writeFileSync(path.join(dir, '.env.cloud'), CLOUD_ENV);
    process.env.MCP_SYSTEMS_PATH = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (originalSystemsPath === undefined) {
      delete process.env.MCP_SYSTEMS_PATH;
    } else {
      process.env.MCP_SYSTEMS_PATH = originalSystemsPath;
    }
  });

  it('reads the full connection profile, not just the URL', () => {
    const systems = discoverSystems();
    const kalog = systems.find((system) => system.name === 'kalog');

    expect(kalog).toMatchObject({
      name: 'kalog',
      url: 'http://172.16.2.111:8030',
      client: '100',
      username: 'abapsupport',
      systemType: 'legacy',
      connectionType: 'rfc',
      masterSystem: 'KAD',
      saprouter: '/H/sr2.example.com/H/',
    });
  });

  it('defaults system type to cloud and connection type to http', () => {
    const cloud = discoverSystems().find((system) => system.name === 'cloud');
    expect(cloud).toMatchObject({
      systemType: 'cloud',
      connectionType: 'http',
    });
  });

  it('skips templates and files without SAP_URL', () => {
    fs.writeFileSync(path.join(dir, '.env.example'), CLOUD_ENV);
    fs.writeFileSync(path.join(dir, '.env.broken'), 'SAP_CLIENT=100\n');

    const names = discoverSystems().map((system) => system.name);
    expect(names).not.toContain('example');
    expect(names).not.toContain('broken');
    expect(names).toEqual(expect.arrayContaining(['cloud', 'kalog']));
  });

  it('never exposes credentials through publicSystemInfo', () => {
    const kalog = discoverSystems().find((system) => system.name === 'kalog');
    const info = publicSystemInfo(kalog!) as Record<string, unknown>;

    expect(info.env).toBeUndefined();
    expect(JSON.stringify(info)).not.toContain('secret-kalog');
  });

  it('resolves a system by name and reports alternatives for unknown ones', () => {
    expect(resolveSystemRef('KALOG').system?.name).toBe('kalog');

    const missing = resolveSystemRef('nope');
    expect(missing.system).toBeUndefined();
    expect(missing.available.map((system) => system.name)).toContain('kalog');
  });

  it('resolves an explicit .env path outside the search dirs', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-outside-'));
    const envPath = path.join(outside, '.env.other');
    fs.writeFileSync(envPath, CLOUD_ENV);

    try {
      expect(resolveSystemRef(envPath).system?.name).toBe('other');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('applySystemEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('removes keys the new profile does not define', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-apply-'));
    try {
      const kalogPath = path.join(dir, '.env.kalog');
      const cloudPath = path.join(dir, '.env.cloud');
      fs.writeFileSync(kalogPath, KALOG_ENV);
      fs.writeFileSync(cloudPath, CLOUD_ENV);

      applySystemEnv(describeSystemFile(kalogPath)!.env);
      expect(process.env.SAP_SAPROUTER).toBe('/H/sr2.example.com/H/');
      expect(process.env.SAP_CONNECTION_TYPE).toBe('rfc');
      expect(process.env.SAP_SYSTEM_TYPE).toBe('legacy');

      applySystemEnv(describeSystemFile(cloudPath)!.env);
      // Leaking these into a direct HTTP system would route it through the
      // previous system's SAProuter, or keep it on the RFC transport.
      expect(process.env.SAP_SAPROUTER).toBeUndefined();
      expect(process.env.SAP_CONNECTION_TYPE).toBeUndefined();
      expect(process.env.SAP_MASTER_SYSTEM).toBeUndefined();
      expect(process.env.SAP_URL).toBe('https://cloud.example.com');
      expect(process.env.SAP_USERNAME).toBe('cloud_user');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('covers every SAP_* key the runtime reads per request', () => {
    for (const key of [
      'SAP_URL',
      'SAP_CLIENT',
      'SAP_CONNECTION_TYPE',
      'SAP_SYSTEM_TYPE',
      'SAP_MASTER_SYSTEM',
      'SAP_SAPROUTER',
      'SAP_SYSNR',
    ]) {
      expect(MANAGED_SAP_ENV_KEYS).toContain(key);
    }
  });
});
