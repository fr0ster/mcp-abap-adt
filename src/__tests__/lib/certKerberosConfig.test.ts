/**
 * Tests that cert/kerberos env vars are read into SapConfig
 * and that username/password are NOT required for those auth types.
 *
 * We test against the config.ts getConfig() which is the simpler builder
 * with no circular-dep concerns; it uses setSapConfigOverride as the reset hook.
 */

// Use jest module isolation so each test gets a fresh module state.
// We manipulate process.env directly and reset it in finally blocks.

describe('certificate auth: reads cert env, no user/pass required', () => {
  const REQUIRED_ENV: Record<string, string> = {
    SAP_URL: 'https://host:44300',
    SAP_AUTH_TYPE: 'certificate',
    SAP_CERT_PATH: '/path/to/cert.crt',
    SAP_CERT_KEY_PATH: '/path/to/cert.key',
    SAP_CERT_PFX_PATH: '/path/to/cert.pfx',
    SAP_CERT_PASSPHRASE: '  secret with spaces  ',
  };

  const CLEAR_ENV = ['SAP_USERNAME', 'SAP_PASSWORD', 'SAP_JWT_TOKEN'];

  test('reads cert PEM + PFX fields; no user/pass needed', () => {
    const saved: Record<string, string | undefined> = {};
    // Save and set
    for (const key of [...Object.keys(REQUIRED_ENV), ...CLEAR_ENV]) {
      saved[key] = process.env[key];
    }
    try {
      for (const [k, v] of Object.entries(REQUIRED_ENV)) {
        process.env[k] = v;
      }
      for (const k of CLEAR_ENV) {
        delete process.env[k];
      }

      // Re-require the module fresh to bypass module-level cache
      jest.resetModules();
      const { getConfig, setSapConfigOverride } = require('../../lib/config');
      // Ensure no override is set
      setSapConfigOverride(undefined);

      const cfg = getConfig();
      expect(cfg.authType).toBe('certificate');
      expect(cfg.certPath).toBe('/path/to/cert.crt');
      expect(cfg.certKeyPath).toBe('/path/to/cert.key');
      expect(cfg.certPfxPath).toBe('/path/to/cert.pfx');
      // passphrase must NOT be trimmed
      expect(cfg.certPassphrase).toBe('  secret with spaces  ');
      expect(cfg.username).toBeUndefined();
      expect(cfg.password).toBeUndefined();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      jest.resetModules();
    }
  });
});

describe('kerberos auth: reads SPN + service, no user/pass required', () => {
  const REQUIRED_ENV: Record<string, string> = {
    SAP_URL: 'https://host:44300',
    SAP_AUTH_TYPE: 'kerberos',
    SAP_KERBEROS_SPN: 'HTTP@mysaphost.corp.example',
    SAP_KERBEROS_SERVICE: 'SAP/ERP',
  };

  const CLEAR_ENV = ['SAP_USERNAME', 'SAP_PASSWORD', 'SAP_JWT_TOKEN'];

  test('reads kerberosSpn + kerberosService; no user/pass needed', () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of [...Object.keys(REQUIRED_ENV), ...CLEAR_ENV]) {
      saved[key] = process.env[key];
    }
    try {
      for (const [k, v] of Object.entries(REQUIRED_ENV)) {
        process.env[k] = v;
      }
      for (const k of CLEAR_ENV) {
        delete process.env[k];
      }

      jest.resetModules();
      const { getConfig, setSapConfigOverride } = require('../../lib/config');
      setSapConfigOverride(undefined);

      const cfg = getConfig();
      expect(cfg.authType).toBe('kerberos');
      expect(cfg.kerberosSpn).toBe('HTTP@mysaphost.corp.example');
      expect(cfg.kerberosService).toBe('SAP/ERP');
      expect(cfg.username).toBeUndefined();
      expect(cfg.password).toBeUndefined();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      jest.resetModules();
    }
  });
});
