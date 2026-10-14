import { liveDebugPorts, requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { recordingConnection } from '../../helpers/recordingConnection';

describe('the request user', () => {
  it('is the user systeminformation names', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'sapuser01' }) },
    ]);
    await expect(requestUserOf(conn as any)).resolves.toBe('SAPUSER01');
  });
  it.each([405, 501])(
    "a %i handed back is the call's error, never the login",
    async (status) => {
      const conn = recordingConnection([{ status, data: '' }]);
      const saved = process.env.SAP_USERNAME;
      process.env.SAP_USERNAME = 'processlogin';
      try {
        await expect(requestUserOf(conn as any)).rejects.toMatchObject({
          response: { status },
        });
      } finally {
        if (saved === undefined) delete process.env.SAP_USERNAME;
        else process.env.SAP_USERNAME = saved;
      }
    },
  );
  it('falls back to the login — the scope login before the process login — never the responsible', async () => {
    // No endpoint (`404`) for both lookups: an empty `200` would be an answer
    // without a user, not a reason to use the login.
    const conn = recordingConnection([
      { status: 404, data: '' },
      { status: 404, data: '' },
    ]);
    const saved = {
      SAP_USERNAME: process.env.SAP_USERNAME,
      SAP_RESPONSIBLE: process.env.SAP_RESPONSIBLE,
    };
    process.env.SAP_USERNAME = 'processlogin';
    process.env.SAP_RESPONSIBLE = 'SOMEONEELSE';
    try {
      await expect(requestUserOf(conn as any)).resolves.toBe('PROCESSLOGIN');
      await runWithRequestContext({ login: 'scopelogin' }, async () => {
        await expect(requestUserOf(conn as any)).resolves.toBe('SCOPELOGIN');
      });
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe('our own run', () => {
  const { run } = liveDebugPorts();
  const debuggee = {
    terminalId: '0123456789ABCDEF'.repeat(2),
    ideId: 'FEDCBA9876543210'.repeat(2),
  };

  it.each([
    ['class', { kind: 'class' as const, name: 'CLASS_A' }],
    ['program', { kind: 'program' as const, name: 'PROGRAM_A' }],
  ])('of a %s carries the given ids in its passport', async (_kind, target) => {
    const conn = recordingConnection([{ status: 200, data: 'out' }]);
    await expect(run(conn as any, target, debuggee)).resolves.toEqual({
      ok: true,
      output: 'out',
    });
    const passport = conn.requests[0].headers?.['SAP-PASSPORT'];
    expect(passport).toEqual(expect.any(String));
    expect(passport).toContain(debuggee.terminalId);
    expect(passport).toContain(debuggee.ideId);
  });

  it('without ids carries no passport', async () => {
    const conn = recordingConnection([{ status: 200, data: 'out' }]);
    await run(conn as any, { kind: 'class', name: 'CLASS_A' });
    expect(conn.requests[0].headers?.['SAP-PASSPORT']).toBeUndefined();
  });
});
