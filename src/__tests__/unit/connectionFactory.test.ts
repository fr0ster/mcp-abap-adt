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
  ServerRefusal,
  SYSTEM_TYPE_REQUIRED_WORDS,
} from '../../lib/auth/serverRefusal';
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

  it.each([
    ['nothing declared, a jwt', 'jwt', undefined],
    ['nothing declared, basic', 'basic', undefined],
    ['a blank value', 'jwt', '  '],
    ['a value of no kind', 'basic', 'abap-cloud'],
  ] as const)(
    'is required, never guessed: %s is system_type_required',
    (_what, authType, declared) => {
      const thrown = (() => {
        try {
          resolveSystemKind(
            settings({ authType }),
            declared === undefined ? {} : { SAP_SYSTEM_TYPE: declared },
          );
        } catch (error) {
          return error;
        }
        return undefined;
      })();
      expect(thrown).toBeInstanceOf(ServerRefusal);
      expect((thrown as ServerRefusal).serverRefusal).toBe(
        'system_type_required',
      );
      expect((thrown as Error).message).toBe(SYSTEM_TYPE_REQUIRED_WORDS);
    },
  );
});

describe('createAbapConnection without a stated kind', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  afterEach(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  it.each(['jwt', 'basic'] as const)(
    'a %s destination is refused system_type_required, before any connector is built',
    (authType) => {
      delete process.env.SAP_SYSTEM_TYPE;
      expect(() =>
        createAbapConnection(
          settings({ authType }),
          new BasicAuthProvider('user', 'secret') as IAuthProvider,
        ),
      ).toThrow(SYSTEM_TYPE_REQUIRED_WORDS);
    },
  );
});
