/**
 * The debugger's request user: a `systeminformation` answer that names no
 * user is not a valid ABAP system — the call's `system_without_user`, with no
 * fallback to the login — while a system without the endpoint (`404`) falls
 * back to the configured login.
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

it('an answer without a user is system_without_user, the login not used', async () => {
  const { standIn, connection } = await onPremise();
  try {
    standIn.body(
      (r) => r.url.startsWith(SYSTEM_INFORMATION),
      JSON.stringify({ systemID: 'SID' }),
    );
    const error = await requestUserOf(connection).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ServerRefusal);
    expect((error as ServerRefusal).serverRefusal).toBe('system_without_user');
  } finally {
    await (connection as unknown as { disconnect(): Promise<void> })
      .disconnect()
      .catch(() => undefined);
    await standIn.close();
  }
});

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
