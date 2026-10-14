/**
 * The debugger's request user: a `systeminformation` answer that names no
 * user is not a valid ABAP system — the call's `system_without_user`, with no
 * fallback to the login — while a system without the endpoint (`404`, and
 * only `404`) falls back to the configured login. Any other failure (`405`,
 * `501`, `500`) is the call's error, with no fallback either.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { requestUserOf } from '../../../lib/debugger/ports';
import { adtStandIn } from '../../helpers/adtStandIn';

const SYSTEM_INFORMATION = '/sap/bc/adt/core/http/systeminformation';

async function onPremise() {
  const standIn = await adtStandIn();
  const connection = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    new BasicAuthProvider('LOGIN_USER', 'password'),
  );
  await connection.connect();
  return { standIn, connection };
}

const saved = process.env.SAP_USERNAME;
beforeEach(() => {
  process.env.SAP_USERNAME = 'LOGIN_USER';
});
afterEach(() => {
  if (saved === undefined) delete process.env.SAP_USERNAME;
  else process.env.SAP_USERNAME = saved;
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
    const { standIn, connection } = await onPremise();
    try {
      standIn.body((r) => r.url.startsWith(SYSTEM_INFORMATION), body);
      const error = await requestUserOf(connection).then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(ServerRefusal);
      expect((error as ServerRefusal).serverRefusal).toBe(
        'system_without_user',
      );
    } finally {
      await (connection as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    }
  },
);

it.each([405, 501, 500])(
  'systeminformation answered %i: the call fails with it, the login not used',
  async (status) => {
    const { standIn, connection } = await onPremise();
    try {
      standIn.answer((r) => r.url.startsWith(SYSTEM_INFORMATION), status);
      const error = await requestUserOf(connection).then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeDefined();
      expect(error).not.toBeInstanceOf(ServerRefusal);
      expect(
        (error as { response?: { status?: number } }).response?.status,
      ).toBe(status);
    } finally {
      await (connection as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    }
  },
);

it('no systeminformation endpoint: the configured login', async () => {
  const { standIn, connection } = await onPremise();
  try {
    standIn.systemInformation(null);
    await expect(requestUserOf(connection)).resolves.toBe('LOGIN_USER');
  } finally {
    await (connection as unknown as { disconnect(): Promise<void> })
      .disconnect()
      .catch(() => undefined);
    await standIn.close();
  }
});
