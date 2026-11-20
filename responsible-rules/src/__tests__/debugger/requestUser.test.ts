/**
 * The debugger's request user over a recording connection: the responsible
 * of its connection's parameters, made once by the rules (`userOf`: lib's
 * hook with `responsibleRules`), by the connection's kind.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  assertMatchObject,
  rejectionOf,
} from '../../../../src/__tests__/helpers/assertions';
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
    assert.equal(await userOf(conn), 'SAPUSER01');
  });
  it('on ABAP Cloud the stated kind of the server is enough', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'sapuser01' }) },
    ]);
    assert.equal(await userOf(conn, 'cloud'), 'SAPUSER01');
    assert.equal(conn.requests.length, 1);
  });
  it('on ABAP Cloud a 404 handed back is cloud_without_systeminformation, never the login', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const conn = recordingConnection([{ status: 404, data: '' }]);
    process.env.SAP_USERNAME = 'processlogin';
    assertMatchObject(await rejectionOf(userOf(conn)), {
      serverRefusal: 'cloud_without_systeminformation',
    });
  });
  for (const status of [405, 501, 500]) {
    it(
      format(
        "on ABAP Cloud a %i handed back is the call's system_lookup_failed, never the login",
        status,
      ),
      async () => {
        process.env.SAP_SYSTEM_TYPE = 'cloud';
        const conn = recordingConnection([{ status, data: '' }]);
        process.env.SAP_USERNAME = 'processlogin';
        assertMatchObject(await rejectionOf(userOf(conn)), {
          serverRefusal: 'system_lookup_failed',
        });
      },
    );
  }
  it('on-premise is the user systeminformation names, over the login', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'systemuser' }) },
    ]);
    process.env.SAP_USERNAME = 'processlogin';
    assert.equal(await userOf(conn), 'SYSTEMUSER');
    assert.equal(conn.requests.length, 1);
  });
  it('on-premise without the function (404 handed back): the scope login — never the responsible, never the process login', async () => {
    const conn = recordingConnection([{ status: 404, data: '' }]);
    const another = recordingConnection([{ status: 404, data: '' }]);
    process.env.SAP_USERNAME = 'processlogin';
    process.env.SAP_RESPONSIBLE = 'SOMEONEELSE';
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      assert.equal(await userOf(conn), 'SCOPELOGIN');
    });
    // Made once per connection; a connection with no stated login is unknown.
    assert.equal(await userOf(conn), 'SCOPELOGIN');
    assertMatchObject(await rejectionOf(userOf(another)), {
      serverRefusal: 'system_user_unknown',
    });
  });
  for (const status of [405, 501, 500]) {
    it(
      format('on-premise a %i handed back: the scope login stands in', status),
      async () => {
        const conn = recordingConnection([{ status, data: '' }]);
        await runWithRequestContext({ login: 'scopelogin' }, async () => {
          assert.equal(await userOf(conn), 'SCOPELOGIN');
        });
      },
    );
  }
  it('the stated on-premise kind wins over SAP_SYSTEM_TYPE for a connection the factory did not build', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const conn = recordingConnection([{ status: 404, data: '' }]);
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      assert.equal(await userOf(conn, 'onprem'), 'SCOPELOGIN');
    });
  });
});
