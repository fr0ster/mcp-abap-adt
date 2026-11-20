/**
 * The one connector construction: which connector and which wire follow from
 * the system kind and the connection type, and the credential the connector
 * holds is the object it was given — never one built from the settings.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  AdtCloudConnector,
  AdtOnPremConnector,
  CloudHttpTransport,
  OnPremHttpTransport,
  RfcTransport,
  type SapHttpConfig,
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
import { assertThrows } from '../helpers/assertions';

const settings = (
  extra: Partial<Pick<SapHttpConfig, 'authType'>> = {},
): SapHttpConfig => ({
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
    assert.ok(connection instanceof AdtCloudConnector);
    assert.ok(connection.transport instanceof CloudHttpTransport);
    assert.equal(connection.credential, credential);
  });

  it('builds the on-premise connector on the HTTP transport, holding the given credential', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(settings(), credential) as any;
    assert.ok(connection instanceof AdtOnPremConnector);
    assert.ok(connection.transport instanceof OnPremHttpTransport);
    assert.equal(connection.credential, credential);
  });

  it('builds the on-premise connector on the RFC transport when the connection type is rfc', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(
      {
        authType: 'basic',
        connectionType: 'rfc',
        client: '000',
        language: 'EN',
        ashost: 'sap.example.invalid',
        sysnr: '00',
      },
      credential,
    ) as any;
    assert.ok(connection instanceof AdtOnPremConnector);
    assert.ok(connection.transport instanceof RfcTransport);
    assert.equal(connection.credential, credential);
  });

  it('holds the given credential whatever authType says', () => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = createAbapConnection(
      settings({ authType: 'jwt' }),
      credential,
    ) as any;
    assert.equal(connection.credential, credential);
    const cloud = (() => {
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      return createAbapConnection(
        settings({ authType: 'basic' }),
        credential,
      ) as any;
    })();
    assert.equal(cloud.credential, credential);
  });
});

describe('resolveSystemKind', () => {
  it('lets SAP_SYSTEM_TYPE win over the auth type', () => {
    assert.equal(
      resolveSystemKind(settings({ authType: 'jwt' }), {
        SAP_SYSTEM_TYPE: 'onprem',
      }),
      'onprem',
    );
    assert.equal(
      resolveSystemKind(settings({ authType: 'jwt' }), {
        SAP_SYSTEM_TYPE: 'legacy',
      }),
      'onprem',
    );
    assert.equal(
      resolveSystemKind(settings({ authType: 'basic' }), {
        SAP_SYSTEM_TYPE: 'cloud',
      }),
      'cloud',
    );
  });

  for (const [_what, authType, declared] of [
    ['nothing declared, a jwt', 'jwt', undefined],
    ['nothing declared, basic', 'basic', undefined],
    ['a blank value', 'jwt', '  '],
    ['a value of no kind', 'basic', 'abap-cloud'],
  ] as const) {
    it(
      format('is required, never guessed: %s is system_type_required', _what),
      () => {
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
        assert.ok(thrown instanceof ServerRefusal);
        assert.equal(
          (thrown as ServerRefusal).serverRefusal,
          'system_type_required',
        );
        assert.equal((thrown as Error).message, SYSTEM_TYPE_REQUIRED_WORDS);
      },
    );
  }
});

describe('createAbapConnection without a stated kind', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  afterEach(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  for (const authType of ['jwt', 'basic'] as const) {
    it(
      format(
        'a %s destination is refused system_type_required, before any connector is built',
        authType,
      ),
      () => {
        delete process.env.SAP_SYSTEM_TYPE;
        assertThrows(
          () =>
            createAbapConnection(
              settings({ authType }),
              new BasicAuthProvider('user', 'secret') as IAuthProvider,
            ),
          SYSTEM_TYPE_REQUIRED_WORDS,
        );
      },
    );
  }
});
