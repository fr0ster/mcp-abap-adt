import { requestUserOf, run } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { recordingConnection } from '../../helpers/recordingConnection';

describe('the request user', () => {
  it('is the user systeminformation names', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'sapuser01' }) },
    ]);
    await expect(requestUserOf(conn as any)).resolves.toBe('SAPUSER01');
  });
  it('falls back to the login — the scope login before the process login — never the responsible', async () => {
    const conn = recordingConnection([{ status: 404, data: '' }]);
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
  const debuggee = {
    terminalId: '0123456789ABCDEF'.repeat(2),
    ideId: 'FEDCBA9876543210'.repeat(2),
  };

  it.each([
    ['class', { kind: 'class' as const, name: 'CL_RUNNABLE' }],
    ['program', { kind: 'program' as const, name: 'RUNNABLE' }],
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
    await run(conn as any, { kind: 'class', name: 'CL_RUNNABLE' });
    expect(conn.requests[0].headers?.['SAP-PASSPORT']).toBeUndefined();
  });
});
