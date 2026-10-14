/**
 * The debugger's request user. `systeminformation` is asked of every
 * system: an answer naming its user is the user, over any configured login.
 * Anything else is no information. On-premise (a `404`, an answer without a
 * user, another status) the responsible if stated, else the configured login
 * (the request scope's, then the process's) stands in, none → `system_user_unknown`, the tool path's code
 * and words. A `404` is kept for the connection: asked once. A `401` is the
 * credential failure as it came, on both kinds. On ABAP Cloud, which
 * always has it, one step to the call's error: a `404`
 * `cloud_without_systeminformation` (the configuration is inconsistent),
 * anything else `system_lookup_failed` — never the login in its place.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { failureOf } from '../../../lib/auth/failures';
import {
  ServerRefusal,
  SYSTEM_USER_UNKNOWN_WORDS,
} from '../../../lib/auth/serverRefusal';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import {
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../../lib/systemContext';
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

/** The tool path's refusal for an unknown session user. */
const USER_UNKNOWN = {
  serverRefusal: 'system_user_unknown',
  message: SYSTEM_USER_UNKNOWN_WORDS,
};

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
      await expect(requestUserOf(connection)).rejects.toMatchObject(
        USER_UNKNOWN,
      );
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it.each([
    ['responsible only', { responsible: 'resp_user' }, undefined, 'RESP_USER'],
    ['login only', { login: 'scopelogin' }, undefined, 'SCOPELOGIN'],
    [
      'both: the responsible',
      { responsible: 'resp_user', login: 'scopelogin' },
      'PROCESS_LOGIN',
      'RESP_USER',
    ],
  ])(
    'without the function (404), %s: the responsible if stated, else the login',
    async (_what, scope, processLogin, expected) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.answer(isLookup, 404);
        if (processLogin === undefined) delete process.env.SAP_USERNAME;
        else process.env.SAP_USERNAME = processLogin;
        await runWithRequestContext(scope, async () => {
          await expect(requestUserOf(connection)).resolves.toBe(expected);
        });
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );

  it('without the function (404), a responsible stated for the process (SAP_RESPONSIBLE) is taken over the login', async () => {
    const { standIn, connection } = await standConnection();
    process.env.SAP_RESPONSIBLE = 'process_resp';
    systemContextFromConfiguration();
    try {
      standIn.answer(isLookup, 404);
      await expect(requestUserOf(connection)).resolves.toBe('PROCESS_RESP');
    } finally {
      delete process.env.SAP_RESPONSIBLE;
      resetSystemContextCache();
      await closeBoth(standIn, connection);
    }
  });

  it('with an answer naming its user, a stated responsible does not replace it', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.body(isLookup, JSON.stringify({ userName: 'system_user' }));
      await runWithRequestContext({ responsible: 'resp_user' }, async () => {
        await expect(requestUserOf(connection)).resolves.toBe('SYSTEM_USER');
      });
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it('without the function (404): asked once — a later call sends no systeminformation', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 404);
      await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
      await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
      delete process.env.SAP_USERNAME;
      await expect(requestUserOf(connection)).rejects.toMatchObject(
        USER_UNKNOWN,
      );
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it.each(WITHOUT_USER)(
    'an answer with %s: the request scope login, then the process login',
    async (_what, body) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.body(isLookup, body);
        await runWithRequestContext({ login: 'scopelogin' }, async () => {
          await expect(requestUserOf(connection)).resolves.toBe('SCOPELOGIN');
        });
        await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
        delete process.env.SAP_USERNAME;
        await expect(requestUserOf(connection)).rejects.toMatchObject(
          USER_UNKNOWN,
        );
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );

  it.each([405, 501, 500])(
    'systeminformation answered %i: the request scope login, then the process login',
    async (status) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.answer(isLookup, status);
        await runWithRequestContext({ login: 'scopelogin' }, async () => {
          await expect(requestUserOf(connection)).resolves.toBe('SCOPELOGIN');
        });
        await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
        delete process.env.SAP_USERNAME;
        await expect(requestUserOf(connection)).rejects.toMatchObject(
          USER_UNKNOWN,
        );
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
    'an answer with %s is system_lookup_failed, the login not used',
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
          'system_lookup_failed',
        );
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );

  it('systeminformation answered 404: the configuration is inconsistent — cloud_without_systeminformation, the login not used', async () => {
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 404);
      await expect(requestUserOf(connection)).rejects.toMatchObject({
        serverRefusal: 'cloud_without_systeminformation',
        message:
          'the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run',
      });
      expect(standIn.requests.filter(isLookup)).toHaveLength(1);
    } finally {
      await closeBoth(standIn, connection);
    }
  });

  it.each([405, 501, 500])(
    'systeminformation answered %i: system_lookup_failed, the login not used',
    async (status) => {
      const { standIn, connection } = await standConnection();
      try {
        standIn.answer(isLookup, status);
        await expect(requestUserOf(connection)).rejects.toMatchObject({
          serverRefusal: 'system_lookup_failed',
        });
        expect(standIn.requests.filter(isLookup)).toHaveLength(1);
      } finally {
        await closeBoth(standIn, connection);
      }
    },
  );
});

describe.each([
  ['on-premise', 'onprem'],
  ['ABAP Cloud', 'cloud'],
])('%s: a 401 on the lookup', (_kind, kind) => {
  it('is the credential failure as it came — no login stands in, no other error', async () => {
    process.env.SAP_SYSTEM_TYPE = kind;
    const { standIn, connection } = await standConnection();
    try {
      standIn.answer(isLookup, 401);
      const error = await requestUserOf(connection).then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      expect(error).not.toBeInstanceOf(ServerRefusal);
      expect(failureOf(error)).toMatchObject({
        error: 'authentication_failed',
      });
    } finally {
      await closeBoth(standIn, connection);
    }
  });
});
