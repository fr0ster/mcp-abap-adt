/**
 * The debugger's request user over a recording connection: the responsible
 * of its connection's parameters, made once by the rules (`userOf`: lib's
 * hook with `responsibleRules`), by the connection's kind.
 */

import { recordingConnection } from '../../../../src/__tests__/helpers/recordingConnection';
import { requestUserOf } from '../../../../src/lib/debugger/ports';
import {
  defaultSystemContextResolver,
  runWithRequestContext,
  withResolvedSystemContext,
} from '../../../../src/lib/requestContext';
import { responsibleRules } from '../../index';

/** The debugger's request user, its connection's parameters made by the rules. */
function userOf(connection: unknown, systemType?: string) {
  return withResolvedSystemContext(
    connection as never,
    async () => requestUserOf(),
    defaultSystemContextResolver,
    systemType,
    responsibleRules,
  );
}

describe('the request user', () => {
  const saved = {
    SAP_USERNAME: process.env.SAP_USERNAME,
    SAP_RESPONSIBLE: process.env.SAP_RESPONSIBLE,
    SAP_SYSTEM_TYPE: process.env.SAP_SYSTEM_TYPE,
  };
  beforeEach(() => {
    // The kind is required: on-premise unless the case states cloud.
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('on ABAP Cloud is the user systeminformation names', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'sapuser01' }) },
    ]);
    await expect(userOf(conn)).resolves.toBe('SAPUSER01');
  });
  it('on ABAP Cloud the stated kind of the server is enough', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'sapuser01' }) },
    ]);
    await expect(userOf(conn, 'cloud')).resolves.toBe('SAPUSER01');
    expect(conn.requests).toHaveLength(1);
  });
  it('on ABAP Cloud a 404 handed back is cloud_without_systeminformation, never the login', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const conn = recordingConnection([{ status: 404, data: '' }]);
    process.env.SAP_USERNAME = 'processlogin';
    await expect(userOf(conn)).rejects.toMatchObject({
      serverRefusal: 'cloud_without_systeminformation',
    });
  });
  it.each([405, 501, 500])(
    "on ABAP Cloud a %i handed back is the call's system_lookup_failed, never the login",
    async (status) => {
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      const conn = recordingConnection([{ status, data: '' }]);
      process.env.SAP_USERNAME = 'processlogin';
      await expect(userOf(conn)).rejects.toMatchObject({
        serverRefusal: 'system_lookup_failed',
      });
    },
  );
  it('on-premise is the user systeminformation names, over the login', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'systemuser' }) },
    ]);
    process.env.SAP_USERNAME = 'processlogin';
    await expect(userOf(conn)).resolves.toBe('SYSTEMUSER');
    expect(conn.requests).toHaveLength(1);
  });
  it('on-premise without the function (404 handed back): the login — the scope login before the process login — never the responsible', async () => {
    const conn = recordingConnection([{ status: 404, data: '' }]);
    const another = recordingConnection([{ status: 404, data: '' }]);
    process.env.SAP_USERNAME = 'processlogin';
    process.env.SAP_RESPONSIBLE = 'SOMEONEELSE';
    await expect(userOf(conn)).resolves.toBe('PROCESSLOGIN');
    // Made once per connection: another connection for the scope's login.
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      await expect(userOf(another)).resolves.toBe('SCOPELOGIN');
      await expect(userOf(conn)).resolves.toBe('PROCESSLOGIN');
    });
  });
  it.each([405, 501, 500])(
    'on-premise a %i handed back: the login stands in',
    async (status) => {
      const conn = recordingConnection([{ status, data: '' }]);
      process.env.SAP_USERNAME = 'processlogin';
      await expect(userOf(conn)).resolves.toBe('PROCESSLOGIN');
    },
  );
  it('the stated on-premise kind wins over SAP_SYSTEM_TYPE for a connection the factory did not build', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    process.env.SAP_USERNAME = 'processlogin';
    const conn = recordingConnection([{ status: 404, data: '' }]);
    await expect(userOf(conn, 'onprem')).resolves.toBe('PROCESSLOGIN');
  });
});
