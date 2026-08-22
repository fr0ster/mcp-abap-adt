import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getActiveSystem,
  setActiveSystem,
} from '../../lib/systems/activeSystem';
import { describeSystemFile } from '../../lib/systems/envSystems';
import {
  type ISwitchableServer,
  SystemSwitcher,
} from '../../server/SystemSwitcher';

const LEGACY_ENV = [
  'SAP_URL=http://legacy.example.com:8030',
  'SAP_CLIENT=100',
  'SAP_USERNAME=legacy_user',
  'SAP_PASSWORD=pw',
  'SAP_CONNECTION_TYPE=rfc',
  'SAP_SYSTEM_TYPE=legacy',
  'SAP_MASTER_SYSTEM=KAD',
].join('\n');

const ONPREM_ENV = [
  'SAP_URL=https://onprem.example.com',
  'SAP_CLIENT=200',
  'SAP_USERNAME=onprem_user',
  'SAP_PASSWORD=pw',
  'SAP_SYSTEM_TYPE=onprem',
  'SAP_MASTER_SYSTEM=DEV',
].join('\n');

function makeServer(overrides: Partial<ISwitchableServer> = {}) {
  const calls: string[] = [];
  const server: ISwitchableServer = {
    resetConnection: jest.fn(async () => {
      calls.push('resetConnection');
    }),
    setConnectionContext: jest.fn(async () => {
      calls.push('setConnectionContext');
    }),
    applyToolAvailability: jest.fn(() => {
      calls.push('applyToolAvailability');
    }),
    verifyConnection: jest.fn(async () => {
      calls.push('verifyConnection');
    }),
    ...overrides,
  };
  return { server, calls };
}

describe('SystemSwitcher', () => {
  let dir: string;
  let legacyPath: string;
  let onpremPath: string;
  const originalEnv = process.env;
  const originalSystemsPath = process.env.MCP_SYSTEMS_PATH;

  const factory = {
    createEnvFileBroker: jest.fn(async () => ({}) as any),
  } as any;

  beforeEach(() => {
    process.env = { ...originalEnv };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-switch-'));
    legacyPath = path.join(dir, '.env.legacy');
    onpremPath = path.join(dir, '.env.onprem');
    fs.writeFileSync(legacyPath, LEGACY_ENV);
    fs.writeFileSync(onpremPath, ONPREM_ENV);
    process.env.MCP_SYSTEMS_PATH = dir;
    setActiveSystem(undefined);
    factory.createEnvFileBroker.mockClear();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    setActiveSystem(undefined);
    process.env = { ...originalEnv };
    if (originalSystemsPath === undefined) {
      delete process.env.MCP_SYSTEMS_PATH;
    } else {
      process.env.MCP_SYSTEMS_PATH = originalSystemsPath;
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('marks the active system in the list', () => {
    const { server } = makeServer();
    const switcher = new SystemSwitcher(server, factory);
    switcher.adoptCurrent(describeSystemFile(legacyPath)!);

    const listed = switcher.list();
    expect(listed.active).toBe('legacy');
    expect(listed.systems.find((s) => s.name === 'legacy')?.active).toBe(true);
    expect(listed.systems.find((s) => s.name === 'onprem')?.active).toBe(false);
  });

  it('swaps env, broker and connection in a safe order', async () => {
    const { server, calls } = makeServer();
    const switcher = new SystemSwitcher(server, factory);
    switcher.adoptCurrent(describeSystemFile(legacyPath)!);
    calls.length = 0;

    const result = await switcher.switchTo('onprem');

    expect(result.active.name).toBe('onprem');
    expect(result.previous).toBe('legacy');
    expect(getActiveSystem()?.name).toBe('onprem');

    // RFC/SAProuter settings of the legacy system must not survive.
    expect(process.env.SAP_URL).toBe('https://onprem.example.com');
    expect(process.env.SAP_CONNECTION_TYPE).toBeUndefined();
    expect(process.env.SAP_SYSTEM_TYPE).toBe('onprem');
    expect(process.env.SAP_MASTER_SYSTEM).toBe('DEV');

    expect(factory.createEnvFileBroker).toHaveBeenCalledWith(
      'system:onprem',
      onpremPath,
    );
    expect(calls).toEqual([
      'resetConnection',
      'setConnectionContext',
      'verifyConnection',
      'applyToolAvailability',
    ]);
  });

  it('rolls back to the previous system when the new one cannot connect', async () => {
    let attempt = 0;
    const { server } = makeServer({
      verifyConnection: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('ECONNREFUSED');
      }),
    });
    const switcher = new SystemSwitcher(server, factory);
    switcher.adoptCurrent(describeSystemFile(legacyPath)!);

    await expect(switcher.switchTo('onprem')).rejects.toThrow(
      /Rolled back to "legacy"/,
    );

    expect(getActiveSystem()?.name).toBe('legacy');
    expect(process.env.SAP_URL).toBe('http://legacy.example.com:8030');
    expect(process.env.SAP_CONNECTION_TYPE).toBe('rfc');
  });

  it('lists the alternatives when the name is unknown', async () => {
    const { server } = makeServer();
    const switcher = new SystemSwitcher(server, factory);
    switcher.adoptCurrent(describeSystemFile(legacyPath)!);

    await expect(switcher.switchTo('nope')).rejects.toThrow(
      /Unknown system "nope".*legacy.*onprem/s,
    );
    expect(getActiveSystem()?.name).toBe('legacy');
  });
});
