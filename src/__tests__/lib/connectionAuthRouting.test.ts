/**
 * Verifies that the server's dependency wiring reaches the correct connection
 * class for certificate and kerberos auth types.
 *
 * This is a config-only test (no code fix was needed in the server): all three
 * call sites in BaseMcpServer.ts, utils.ts, and handleDeletePackage.ts pass the
 * full SapConfig object unmodified to createAbapConnection, so the factory's
 * own switch-case routes correctly.
 */

import type { SapConfig } from '@mcp-abap-adt/connection';
import {
  CertificateAbapConnection,
  createAbapConnection,
  KerberosAbapConnection,
} from '@mcp-abap-adt/connection';

const BASE_URL = 'https://mysap.example.com:44300';

describe('connection factory routing', () => {
  test('certificate config → CertificateAbapConnection', () => {
    const config: SapConfig = {
      url: BASE_URL,
      authType: 'certificate',
      certPath: '/path/to/cert.crt',
      certKeyPath: '/path/to/cert.key',
    };
    const conn = createAbapConnection(config);
    expect(conn).toBeInstanceOf(CertificateAbapConnection);
    expect(conn.constructor.name).toBe('CertificateAbapConnection');
  });

  test('kerberos config → KerberosAbapConnection', () => {
    const config: SapConfig = {
      url: BASE_URL,
      authType: 'kerberos',
      kerberosSpn: 'HTTP@mysap.example.com',
    };
    const conn = createAbapConnection(config);
    expect(conn).toBeInstanceOf(KerberosAbapConnection);
    expect(conn.constructor.name).toBe('KerberosAbapConnection');
  });
});
