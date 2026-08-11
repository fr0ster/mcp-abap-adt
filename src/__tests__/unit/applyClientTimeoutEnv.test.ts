import { applyClientTimeoutEnv } from '../integration/helpers/timeoutEnv';

/**
 * Guard for #174: `test_settings.timeouts` used to govern only the jest test
 * timeout. The request underneath went out with the client library's built-in
 * 45s, because `@mcp-abap-adt/adt-clients` reads `SAP_TIMEOUT_*` from the
 * environment and nothing wrote it — which is how a group activation of 24
 * objects aborted mid-flight while the config said 120s.
 */
const ENV_KEYS = [
  'SAP_TIMEOUT_DEFAULT',
  'SAP_TIMEOUT_LONG',
  'SAP_TIMEOUT_CSRF',
  'SAP_TIMEOUT_CRITICAL',
] as const;

describe('applyClientTimeoutEnv', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('publishes the configured timeouts to the variables the client reads', () => {
    applyClientTimeoutEnv({
      test_settings: {
        timeouts: { default: 120000, long: 600000, csrf: 30000 },
      },
    });

    expect(process.env.SAP_TIMEOUT_DEFAULT).toBe('120000');
    expect(process.env.SAP_TIMEOUT_LONG).toBe('600000');
    expect(process.env.SAP_TIMEOUT_CSRF).toBe('30000');
  });

  it('leaves an explicitly exported value alone', () => {
    process.env.SAP_TIMEOUT_DEFAULT = '999';

    applyClientTimeoutEnv({ test_settings: { timeouts: { default: 120000 } } });

    expect(process.env.SAP_TIMEOUT_DEFAULT).toBe('999');
  });

  it('sets nothing for keys the config does not define', () => {
    applyClientTimeoutEnv({ test_settings: { timeouts: { default: 120000 } } });

    expect(process.env.SAP_TIMEOUT_LONG).toBeUndefined();
    expect(process.env.SAP_TIMEOUT_CSRF).toBeUndefined();
    expect(process.env.SAP_TIMEOUT_CRITICAL).toBeUndefined();
  });

  it('ignores a value that is not a usable duration', () => {
    applyClientTimeoutEnv({
      test_settings: { timeouts: { default: 'soon', long: 0, csrf: -1 } },
    });

    expect(process.env.SAP_TIMEOUT_DEFAULT).toBeUndefined();
    expect(process.env.SAP_TIMEOUT_LONG).toBeUndefined();
    expect(process.env.SAP_TIMEOUT_CSRF).toBeUndefined();
  });

  it('does nothing when the config carries no timeouts at all', () => {
    expect(() => applyClientTimeoutEnv({})).not.toThrow();
    expect(() => applyClientTimeoutEnv(undefined)).not.toThrow();
    expect(process.env.SAP_TIMEOUT_DEFAULT).toBeUndefined();
  });

  it('rounds a fractional value, since the variable is parsed as an integer', () => {
    applyClientTimeoutEnv({ test_settings: { timeouts: { default: 1500.6 } } });

    expect(process.env.SAP_TIMEOUT_DEFAULT).toBe('1501');
  });
});
