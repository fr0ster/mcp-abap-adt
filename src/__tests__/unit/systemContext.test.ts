import type { SapConfig } from '@mcp-abap-adt/connection';
import { createAbapConnection } from '../../lib/connectionFactory';
import {
  getSystemContext,
  resetSystemContextCache,
  resolveSystemContext,
} from '../../lib/systemContext';

// Mock @mcp-abap-adt/adt-clients — covers both static import and dynamic import()
const mockGetSystemInformation = jest.fn().mockResolvedValue(undefined);
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  get getSystemInformation() {
    return mockGetSystemInformation;
  },
}));

// Minimal mock connection
const mockConnection = {
  makeAdtRequest: jest.fn(),
} as any;

const credential = {
  kind: 'test',
  prepare: async () => ({ ok: true as const }),
  establish: async () => ({ ok: true as const }),
  authorize: async () => ({ ok: true as const }),
  rejected: async () => ({ ok: true as const }),
};
/** Built by the factory: the kind is the one it was built for, never the URL's. */
const built = (authType: string) =>
  createAbapConnection(
    { url: 'https://system.example.invalid', authType } as SapConfig,
    credential,
  );

describe('resolveSystemContext', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetSystemContextCache();
    process.env = { ...originalEnv };
    delete process.env.SAP_MASTER_SYSTEM;
    delete process.env.SAP_RESPONSIBLE;
    delete process.env.SAP_USERNAME;
    delete process.env.SAP_SYSTEM_TYPE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use overrides when masterSystem is provided', async () => {
    process.env.SAP_MASTER_SYSTEM = 'FROM_ENV';
    process.env.SAP_RESPONSIBLE = 'ENV_USER';

    const result = await resolveSystemContext(mockConnection, {
      masterSystem: 'FROM_HEADER',
      responsible: 'HEADER_USER',
    });

    expect(result.masterSystem).toBe('FROM_HEADER');
    expect(result.responsible).toBe('HEADER_USER');
  });

  it('should use overrides when only responsible is provided', async () => {
    process.env.SAP_RESPONSIBLE = 'ENV_USER';

    const result = await resolveSystemContext(mockConnection, {
      responsible: 'HEADER_USER',
    });

    expect(result.responsible).toBe('HEADER_USER');
    expect(result.masterSystem).toBeUndefined();
  });

  it('should return overrides via getSystemContext() after resolve', async () => {
    await resolveSystemContext(mockConnection, {
      masterSystem: 'SYS1',
      responsible: 'USER1',
    });

    const ctx = getSystemContext();
    expect(ctx.masterSystem).toBe('SYS1');
    expect(ctx.responsible).toBe('USER1');
  });

  it('should fall back to process.env when overrides is undefined', async () => {
    process.env.SAP_MASTER_SYSTEM = 'ENV_SYS';
    process.env.SAP_RESPONSIBLE = 'ENV_USER';

    const result = await resolveSystemContext(mockConnection);

    expect(result.masterSystem).toBe('ENV_SYS');
    expect(result.responsible).toBe('ENV_USER');
  });

  it('should fall back to process.env when overrides is empty object', async () => {
    process.env.SAP_MASTER_SYSTEM = 'ENV_SYS';

    const result = await resolveSystemContext(mockConnection, {});

    expect(result.masterSystem).toBe('ENV_SYS');
  });

  it('should work after resetSystemContextCache + new resolve with overrides', async () => {
    // First resolve with env
    process.env.SAP_MASTER_SYSTEM = 'OLD_SYS';
    await resolveSystemContext(mockConnection);
    expect(getSystemContext().masterSystem).toBe('OLD_SYS');

    // Reset and resolve with overrides
    resetSystemContextCache();
    await resolveSystemContext(mockConnection, {
      masterSystem: 'NEW_SYS',
      responsible: 'NEW_USER',
    });

    expect(getSystemContext().masterSystem).toBe('NEW_SYS');
    expect(getSystemContext().responsible).toBe('NEW_USER');
  });

  it('should use SAP_USERNAME as fallback for responsible', async () => {
    process.env.SAP_MASTER_SYSTEM = 'SYS';
    process.env.SAP_USERNAME = 'USERNAME_FALLBACK';

    const result = await resolveSystemContext(mockConnection);

    expect(result.responsible).toBe('USERNAME_FALLBACK');
  });

  it('should use cached result on second call without reset', async () => {
    process.env.SAP_MASTER_SYSTEM = 'CACHED_SYS';
    await resolveSystemContext(mockConnection);

    // Change env — should not affect cached result
    process.env.SAP_MASTER_SYSTEM = 'CHANGED_SYS';
    const result = await resolveSystemContext(mockConnection);

    expect(result.masterSystem).toBe('CACHED_SYS');
  });

  it('overrides should win over cached value', async () => {
    // First resolve caches via env
    process.env.SAP_MASTER_SYSTEM = 'CACHED';
    await resolveSystemContext(mockConnection);

    // Overrides should replace the cache
    const result = await resolveSystemContext(mockConnection, {
      masterSystem: 'OVERRIDE',
    });

    expect(result.masterSystem).toBe('OVERRIDE');
  });

  describe('the master system comes from configuration, or by a request in the cloud', () => {
    beforeEach(() => {
      mockGetSystemInformation.mockReset();
      mockGetSystemInformation.mockResolvedValue({
        systemID: 'SYSTEM_FROM_REQUEST',
        userName: 'USER_FROM_REQUEST',
      });
    });

    it('on-premise with an https URL without a port: no request', async () => {
      const result = await resolveSystemContext(built('basic'));
      expect(mockGetSystemInformation).not.toHaveBeenCalled();
      expect(result.masterSystem).toBeUndefined();
      expect(result.responsible).toBeUndefined();
    });

    it('cloud: the system is asked', async () => {
      const result = await resolveSystemContext(built('jwt'));
      expect(mockGetSystemInformation).toHaveBeenCalledTimes(1);
      expect(result.masterSystem).toBe('SYSTEM_FROM_REQUEST');
      expect(result.responsible).toBe('USER_FROM_REQUEST');
    });

    it('cloud with SAP_MASTER_SYSTEM: the configuration wins, no request', async () => {
      process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_CONFIG';
      const result = await resolveSystemContext(built('jwt'));
      expect(mockGetSystemInformation).not.toHaveBeenCalled();
      expect(result.masterSystem).toBe('SYSTEM_FROM_CONFIG');
    });

    it('a connection the factory did not build: SAP_SYSTEM_TYPE alone decides', async () => {
      await resolveSystemContext(mockConnection);
      expect(mockGetSystemInformation).not.toHaveBeenCalled();
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      await resolveSystemContext(mockConnection);
      expect(mockGetSystemInformation).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Four tests lived here pinning `isLegacy` — that a legacy system is
   * detected from `SAP_SYSTEM_TYPE`, that the flag survives an override, and
   * that `getSystemContext()` exposes it. The flag is gone: legacy support is
   * parked on `parked/legacy-support` until it can be tried against a live
   * system, and no tool declares that environment any more. The tests went
   * with it rather than being weakened into asserting `undefined`.
   */
});
