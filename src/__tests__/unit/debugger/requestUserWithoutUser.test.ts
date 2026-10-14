/**
 * The debugger's request user, by the system's kind. `systeminformation`
 * exists only on ABAP Cloud: on-premise the server never asks it, and the
 * user is the configured login (the request scope's, then the process's).
 * On ABAP Cloud it is always asked: an answer naming its user is the user;
 * an answer that names none is `system_without_user`; any other status
 * (`404`, `405`, `501`, `500`) is the call's error as it came — never the
 * login in its place.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { adtStandIn, type StandInRequest } from '../../helpers/adtStandIn';

const SYSTEM_INFORMATION = '/sap/bc/adt/core/http/systeminformation';
const isLookup = (r: StandInRequest) => r.url.startsWith(SYSTEM_INFORMATION);

async function standConnection() {
  const standIn = await adtStandIn();
  const connection = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    new BasicAuthProvider('LOGIN_USER', 'password'),
  );
  await connection.connect();
  return { standIn, connection };
}

async function closeBoth(
  standIn: { close(): Promise<void> },
  connection: unknown,
) {
  await (connection as { disconnect(): Promise<void> })
    .disconnect()
    .catch(() => undefined);
  await standIn.close();
}

const saved = {
  SAP_USERNAME: process.env.SAP_USERNAME,
  SAP_SYSTEM_TYPE: process.env.SAP_SYSTEM_TYPE,
};
beforeEach(() => {
  process.env.SAP_USERNAME = 'LOGIN_USER';
  delete process.env.SAP_SYSTEM_TYPE;
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('on-premise', () => {
  it('systeminformation is never asked: the process login', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.body(isLookup, JSON.stringify({ userName: 'SYSTEM_USER' }));
      await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
      expect(standIn.requests.filter(isLookup)).toHaveLength(0);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it('the request scope login before the process login, nothing asked', async () => {
    const { standIn, connection } = await standConnection();
    try {
      await runWithRequestContext({ login: 'scopelogin' }, async () => {
        await expect(requestUserOf(connection)).resolves.toBe('SCOPELOGIN');
      });
      expect(standIn.requests.filter(isLookup)).toHaveLength(0);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it('no login configured: the user is unknown, nothing asked', async () => {
    const { standIn, connection } = await standConnection();
    try {
      delete process.env.SAP_USERNAME;
      await expect(requestUserOf(connection)).rejects.toThrow(
        'the ABAP user of this connection is unknown',
      );
      expect(standIn.requests.filter(isLookup)).toHaveLength(0);
    } finally {
      await closeBoth(standIn, connection);
    }
  });
});

describe('ABAP Cloud', () => {
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
  });

  it('an answer naming its user: that user, not the login', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.body(isLookup, JSON.stringify({ userName: 'cloud_user' }));
      await expect(requestUserOf(connection)).resolves.toBe('CLOUD_USER');
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  /** `systeminformation` answers that name no user. */
  const WITHOUT_USER: Array<[string, string]> = [
    ['no userName', JSON.stringify({ systemID: 'SID' })],
    ['a blank userName', JSON.stringify({ userName: '  ', systemID: 'SID' })],
    ['a userName that is no string', JSON.stringify({ userName: 42 })],
    ['a body that is no JSON', 'not json'],
    ['an empty body', ''],
    ['a JSON array', JSON.stringify([{ userName: 'ARRAY_USER' }])],
    ['a JSON number', '42'],
    ['a JSON string', JSON.stringify('STRING_USER')],
    ['JSON null', 'null'],
  ];

  it.each(WITHOUT_USER)(
    'an answer with %s is system_without_user, the login not used',
    async (_what, body) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.body(isLookup, body);
        const error = await requestUserOf(connection).then(
          () => undefined,
          (thrown: unknown) => thrown,
        );
        expect(error).toBeInstanceOf(ServerRefusal);
        expect((error as ServerRefusal).serverRefusal).toBe(
          'system_without_user',
        );
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );

  it.each([404, 405, 501, 500])(
    'systeminformation answered %i: the call fails with it, the login not used',
    async (status) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.answer(isLookup, status);
        const error = await requestUserOf(connection).then(
          () => undefined,
          (thrown: unknown) => thrown,
        );
        expect(error).toBeDefined();
        expect(error).not.toBeInstanceOf(ServerRefusal);
        expect(
          (error as { response?: { status?: number } }).response?.status,
        ).toBe(status);
        expect(standIn.requests.filter(isLookup)).toHaveLength(1);
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );
});
