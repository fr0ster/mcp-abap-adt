import {
  getSystemContext,
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../lib/systemContext';

/**
 * The process context the configuration states. It sends nothing: the cloud
 * lookup is the request's (requestSystemResolution.ts), and the per-request
 * order lives in the request scope.
 */
describe('systemContextFromConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetSystemContextCache();
    process.env = { ...originalEnv };
    delete process.env.SAP_MASTER_SYSTEM;
    delete process.env.SAP_RESPONSIBLE;
    delete process.env.SAP_USERNAME;
    delete process.env.SAP_LANGUAGE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reads SAP_MASTER_SYSTEM and SAP_RESPONSIBLE into the process context', () => {
    process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_CONFIG';
    process.env.SAP_RESPONSIBLE = 'USER_FROM_CONFIG';
    expect(systemContextFromConfiguration()).toMatchObject({
      masterSystem: 'SYSTEM_FROM_CONFIG',
      responsible: 'USER_FROM_CONFIG',
    });
    expect(getSystemContext().masterSystem).toBe('SYSTEM_FROM_CONFIG');
  });

  it('SAP_USERNAME is the responsible when SAP_RESPONSIBLE is not set', () => {
    process.env.SAP_USERNAME = 'USER_FROM_LOGON';
    expect(systemContextFromConfiguration()?.responsible).toBe(
      'USER_FROM_LOGON',
    );
  });

  it('SAP_RESPONSIBLE wins over SAP_USERNAME', () => {
    process.env.SAP_USERNAME = 'USER_FROM_LOGON';
    process.env.SAP_RESPONSIBLE = 'USER_FROM_CONFIG';
    expect(systemContextFromConfiguration()?.responsible).toBe(
      'USER_FROM_CONFIG',
    );
  });

  it('states nothing when nothing is configured', () => {
    expect(systemContextFromConfiguration()).toBeUndefined();
    expect(getSystemContext()).toEqual({});
  });
});
