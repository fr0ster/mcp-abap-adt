/**
 * The one connector construction: which connector and which wire follow from
 * the system kind and the connection type, and the credential the connector
 * holds is the object it was given — never one built from the settings.
 */

import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
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

describe('accept correction on the connections the factory builds', () => {
  const previousKind = process.env.SAP_SYSTEM_TYPE;
  const previousSwitch = process.env.ADT_ACCEPT_CORRECTION;
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousKind === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previousKind;
    if (previousSwitch === undefined) delete process.env.ADT_ACCEPT_CORRECTION;
    else process.env.ADT_ACCEPT_CORRECTION = previousSwitch;
  });

  const OLD = 'application/vnd.sap.probe.v1+xml';
  const NEW = 'application/vnd.sap.probe.v2+xml';

  it('a request SAP answers 406 naming a supported type is sent once more with it', async () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    // Off unless switched on: the switch is the factory's own.
    delete process.env.ADT_ACCEPT_CORRECTION;
    const sent: Array<string | undefined> = [];
    jest
      .spyOn(AdtOnPremConnector.prototype, 'makeAdtRequest')
      .mockImplementation(async (request: any) => {
        const accept = request.headers?.Accept as string | undefined;
        sent.push(accept);
        if (accept !== NEW) {
          throw Object.assign(
            new Error('Request failed with status code 406'),
            {
              response: {
                status: 406,
                statusText: 'Not Acceptable',
                headers: { 'x-sap-adt-supported-accept': NEW },
                data: '',
              },
            },
          );
        }
        return { status: 200, statusText: 'OK', headers: {}, data: 'read' };
      });
    const connection = createAbapConnection(
      settings(),
      new BasicAuthProvider('user', 'secret') as IAuthProvider,
    );
    // Only the switch: the connection's request is its own until a client
    // is built over it.
    expect(Object.hasOwn(connection, 'makeAdtRequest')).toBe(false);
    // A client built later over it, as a handler builds one.
    new AdtRuntimeClient(connection, undefined);

    const answer = await connection.makeAdtRequest({
      url: '/sap/bc/adt/probe/item',
      method: 'GET',
      timeout: 0,
      headers: { Accept: OLD },
    });
    expect(answer.data).toBe('read');
    expect(sent).toEqual([OLD, NEW]);
  });
});
