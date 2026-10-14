/**
 * The debugger's request user. `systeminformation` is asked of every
 * system: an answer naming its user is the user, over any configured login;
 * an answer that names none is `system_without_user`. A `404` is the function
 * unavailable: on-premise the configured login (the request scope's, then the
 * process's) stands in, none → the user is unknown; on ABAP Cloud, which
 * always has it, the call's `cloud_without_systeminformation`. Any other status (`405`, `501`, `500`) is the call's error as
 * it came on both kinds — never the login in its place.
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
  // The kind is required: stated for every case (the cloud ones restate it).
  process.env.SAP_SYSTEM_TYPE = 'onprem';
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
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

describe('on-premise', () => {
  it('the system names its user: that user, over the configured login', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.body(isLookup, JSON.stringify({ userName: 'system_user' }));
      await runWithRequestContext({ login: 'scopelogin' }, async () => {
        await expect(requestUserOf(connection)).resolves.toBe('SYSTEM_USER');
      });
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it('without the function (404): the process login', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 404);
      await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it('without the function (404): the request scope login before the process login', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 404);
      await runWithRequestContext({ login: 'scopelogin' }, async () => {
        await expect(requestUserOf(connection)).resolves.toBe('SCOPELOGIN');
      });
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it('without the function (404) and no login configured: the user is unknown', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 404);
      delete process.env.SAP_USERNAME;
      await expect(requestUserOf(connection)).rejects.toThrow(
        'the ABAP user of this connection is unknown',
      );
    } finally {
      await closeBoth(standIn, connection);
    }
  });

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

  it.each([405, 501, 500])(
    'systeminformation answered %i: the call fails with it, the login not used',
    async (status) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.answer(isLookup, status);
        const error = await requestUserOf(connection).then(
          () => undefined,
          (thrown: unknown) => thrown,
        );
        expect(error).not.toBeInstanceOf(ServerRefusal);
        expect(
          (error as { response?: { status?: number } }).response?.status,
        ).toBe(status);
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );
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

  it('systeminformation answered 404: not a valid ABAP Cloud system — cloud_without_systeminformation, the login not used', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 404);
      await expect(requestUserOf(connection)).rejects.toMatchObject({
        serverRefusal: 'cloud_without_systeminformation',
        message:
          'the ABAP Cloud system answered without systeminformation, which every ABAP Cloud system has: the destination is not a valid ABAP Cloud system; the tool did not run',
      });
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it.each([405, 501, 500])(
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
