/**
 * Verifies that the server's own connection factory routes certificate and
 * kerberos auth types the way `src/lib/connectionFactory.ts` documents.
 *
 * This test predates that factory. `@mcp-abap-adt/connection` 6.0 removed its
 * own factory *and* the per-auth-type connection classes this test used to
 * assert against (`CertificateAbapConnection`, `KerberosAbapConnection`,
 * `createAbapConnection`) — none of the three is exported by the package any
 * more (`index.d.ts`: only `AdtCloudConnector`/`AdtOnPremConnector`, one
 * class per *system kind*, paired with an auth *provider*). It was red on
 * `main` before this migration touched it (unchanged there — `git diff main`
 * on this path is empty) and is rewritten here against this repository's own
 * factory rather than a package export that no longer exists.
 *
 * Certificate auth is now `AdtOnPremConnector` plus a `CertificateAuthProvider`
 * credential — there is no separate connection class per auth type any more,
 * so "routes to the right class" becomes "routes to the right system kind and
 * credential provider". Kerberos has no credential provider in connection 6.x
 * at all (`connectionFactory.ts`'s own `refuseKerberos`) and is refused
 * outright rather than routed anywhere.
 */

import type { SapConfig } from '@mcp-abap-adt/connection';
import {
  AdtOnPremConnector,
  CertificateAuthProvider,
} from '@mcp-abap-adt/connection';
import { createAbapConnection } from '../../lib/connectionFactory';

const BASE_URL = 'https://mysap.example.com:44300';

describe('connection factory routing', () => {
  test('certificate config → AdtOnPremConnector with a CertificateAuthProvider credential', () => {
    const config: SapConfig = {
      url: BASE_URL,
      authType: 'certificate',
      certPath: '/path/to/cert.crt',
      certKeyPath: '/path/to/cert.key',
    };
    const conn = createAbapConnection(config);
    expect(conn).toBeInstanceOf(AdtOnPremConnector);
    // The credential is a constructor argument, not part of IAbapConnection —
    // read it back off the instance the way the rest of this file already
    // reaches past the interface for connection-internal state.
    expect((conn as any).credential).toBeInstanceOf(CertificateAuthProvider);
  });

  test('kerberos config → refused, not routed', () => {
    const config: SapConfig = {
      url: BASE_URL,
      authType: 'kerberos',
      kerberosSpn: 'HTTP@mysap.example.com',
    };
    expect(() => createAbapConnection(config)).toThrow(
      /Kerberos authentication is not available/,
    );
  });
});
