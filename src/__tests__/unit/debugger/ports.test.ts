import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { liveDebugPorts, requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { assertMatchObject, assertThrows } from '../../helpers/assertions';
import { recordingConnection } from '../../helpers/recordingConnection';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

describe('the request user, no rules', () => {
  const saved = {
    SAP_USERNAME: process.env.SAP_USERNAME,
  };
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetSystemContextCache();
  });

  it('is the stated responsible, upper case, and sends nothing', async () => {
    process.env.SAP_USERNAME = 'processlogin';
    await runWithRequestContext({ responsible: 'resp_user' }, async () => {
      assert.equal(requestUserOf(), 'RESP_USER');
    });
  });
  it('no responsible: the scope login; both: the responsible', async () => {
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      assert.equal(requestUserOf(), 'SCOPELOGIN');
    });
    await runWithRequestContext(
      { login: 'scopelogin', responsible: 'resp_user' },
      async () => {
        assert.equal(requestUserOf(), 'RESP_USER');
      },
    );
  });
  it('the process SAP_USERNAME is no login: system_user_unknown', () => {
    process.env.SAP_USERNAME = 'processlogin';
    assertMatchObject(
      assertThrows(() => requestUserOf()),
      { serverRefusal: 'system_user_unknown' },
    );
  });
  it('neither: system_user_unknown', () => {
    assertMatchObject(
      assertThrows(() => requestUserOf()),
      { serverRefusal: 'system_user_unknown' },
    );
  });
  it('the live ports ask the stated value, not the connection', async () => {
    const conn = recordingConnection([]);
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      assert.equal(
        await liveDebugPorts().requestUser({ connection: conn as never }),
        'SCOPELOGIN',
      );
    });
    assert.equal(conn.requests.length, 0);
  });
});

describe('our own run', () => {
  const { run } = liveDebugPorts();
  const debuggee = {
    terminalId: '0123456789ABCDEF'.repeat(2),
    ideId: 'FEDCBA9876543210'.repeat(2),
  };

  for (const [_kind, target] of [
    ['class', { kind: 'class' as const, name: 'CLASS_A' }],
    ['program', { kind: 'program' as const, name: 'PROGRAM_A' }],
  ] satisfies [string, Parameters<typeof run>[1]][]) {
    it(
      format('of a %s carries the given ids in its passport', _kind),
      async () => {
        const conn = recordingConnection([{ status: 200, data: 'out' }]);
        assert.deepStrictEqual(await run(conn as any, target, debuggee), {
          ok: true,
          output: 'out',
        });
        const passport = conn.requests[0].headers?.['SAP-PASSPORT'];
        assert.ok(typeof passport === 'string');
        assert.ok(passport.includes(debuggee.terminalId));
        assert.ok(passport.includes(debuggee.ideId));
      },
    );
  }

  it('without ids carries no passport', async () => {
    const conn = recordingConnection([{ status: 200, data: 'out' }]);
    await run(conn as any, { kind: 'class', name: 'CLASS_A' });
    assert.equal(conn.requests[0].headers?.['SAP-PASSPORT'], undefined);
  });
});
