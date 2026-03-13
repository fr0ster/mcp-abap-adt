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

  it('should detect cloud system as not legacy (default)', async () => {
    process.env.SAP_MASTER_SYSTEM = 'SYS';

    const result = await resolveSystemContext(mockConnection);

    expect(result.isLegacy).toBe(false);
  });

  it('should detect legacy system when SAP_SYSTEM_TYPE=legacy', async () => {
    process.env.SAP_SYSTEM_TYPE = 'legacy';
    process.env.SAP_MASTER_SYSTEM = 'OLD_SYS';

    const result = await resolveSystemContext(mockConnection);

    expect(result.isLegacy).toBe(true);
  });

  it('should preserve isLegacy when overrides are applied', async () => {
    process.env.SAP_SYSTEM_TYPE = 'legacy';
    process.env.SAP_MASTER_SYSTEM = 'OLD_SYS';
    await resolveSystemContext(mockConnection);

    // Now apply overrides — isLegacy should be preserved from cache
    const result = await resolveSystemContext(mockConnection, {
      masterSystem: 'OVERRIDE',
    });

    expect(result.masterSystem).toBe('OVERRIDE');
    expect(result.isLegacy).toBe(true);
  });

  it('should expose isLegacy via getSystemContext()', async () => {
    process.env.SAP_SYSTEM_TYPE = 'legacy';
    process.env.SAP_MASTER_SYSTEM = 'SYS';
    await resolveSystemContext(mockConnection);

    expect(getSystemContext().isLegacy).toBe(true);
  });
});
