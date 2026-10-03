/**
 * The one connector construction: which connector and which wire follow from
 * the system kind and the connection type, and the credential the connector
 * holds is the object it was given — never one built from the settings.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  AdtCloudConnector,
  AdtOnPremConnector,
  CloudHttpTransport,
  OnPremHttpTransport,
  RfcTransport,
  type SapConfig,
} from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import {
  createAbapConnection,
  resolveSystemKind,
} from '../../lib/connectionFactory';

const settings = (extra: Partial<SapConfig> = {}): SapConfig => ({
  url: 'https://sap.example.invalid',
  client: '000',
  authType: 'basic',
  ...extra,
});

describe('createAbapConnection', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  afterEach(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  const credential = new BasicAuthProvider('user', 'secret') as IAuthProvider;

  it('builds the cloud connector on the cloud transport, holding the given credential', () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const connection = createAbapConnection(settings(), credential) as any;
    expect(connection).toBeInstanceOf(AdtCloudConnector);
    expect(connection.transport).toBeInstanceOf(CloudHttpTransport);
    expect(connection.credential).toBe(credential);
  });

  it('builds the on-premise connector on the HTTP transport, holding the given credential', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(settings(), credential) as any;
    expect(connection).toBeInstanceOf(AdtOnPremConnector);
    expect(connection.transport).toBeInstanceOf(OnPremHttpTransport);
    expect(connection.credential).toBe(credential);
  });

  it('builds the on-premise connector on the RFC transport when the connection type is rfc', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(
      settings({ connectionType: 'rfc' }),
      credential,
    ) as any;
    expect(connection).toBeInstanceOf(AdtOnPremConnector);
    expect(connection.transport).toBeInstanceOf(RfcTransport);
    expect(connection.credential).toBe(credential);
  });

  it('holds the given credential whatever authType says', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(
      settings({ authType: 'jwt' }),
      credential,
    ) as any;
    expect(connection.credential).toBe(credential);
    const cloud = (() => {
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      return createAbapConnection(
        settings({ authType: 'basic' }),
        credential,
      ) as any;
    })();
    expect(cloud.credential).toBe(credential);
  });
});

describe('resolveSystemKind', () => {
  it('lets SAP_SYSTEM_TYPE win over the auth type', () => {
    expect(
      resolveSystemKind(settings({ authType: 'jwt' }), {
        SAP_SYSTEM_TYPE: 'onprem',
      }),
    ).toBe('onprem');
    expect(
      resolveSystemKind(settings({ authType: 'jwt' }), {
        SAP_SYSTEM_TYPE: 'legacy',
      }),
    ).toBe('onprem');
    expect(
      resolveSystemKind(settings({ authType: 'basic' }), {
        SAP_SYSTEM_TYPE: 'cloud',
      }),
    ).toBe('cloud');
  });

  it('takes jwt as cloud and anything else as on-premise when nothing is declared', () => {
    expect(resolveSystemKind(settings({ authType: 'jwt' }), {})).toBe('cloud');
    expect(resolveSystemKind(settings({ authType: 'basic' }), {})).toBe(
      'onprem',
    );
    expect(resolveSystemKind(settings({ authType: 'saml' }), {})).toBe(
      'onprem',
    );
  });
});
