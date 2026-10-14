import { liveDebugPorts, requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { recordingConnection } from '../../helpers/recordingConnection';

describe('the request user', () => {
  const saved = {
    SAP_USERNAME: process.env.SAP_USERNAME,
    SAP_RESPONSIBLE: process.env.SAP_RESPONSIBLE,
    SAP_SYSTEM_TYPE: process.env.SAP_SYSTEM_TYPE,
  };
  beforeEach(() => {
    delete process.env.SAP_SYSTEM_TYPE;
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
    await expect(requestUserOf(conn as any)).resolves.toBe('SAPUSER01');
  });
  it('on ABAP Cloud the stated kind of the server is enough', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'sapuser01' }) },
    ]);
    await expect(requestUserOf(conn as any, 'cloud')).resolves.toBe(
      'SAPUSER01',
    );
    expect(conn.requests).toHaveLength(1);
  });
  it.each([404, 405, 501, 500])(
    "on ABAP Cloud a %i handed back is the call's error, never the login",
    async (status) => {
      process.env.SAP_SYSTEM_TYPE = 'cloud';
      const conn = recordingConnection([{ status, data: '' }]);
      process.env.SAP_USERNAME = 'processlogin';
      await expect(requestUserOf(conn as any)).rejects.toMatchObject({
        response: { status },
      });
    },
  );
  it('on-premise is the user systeminformation names, over the login', async () => {
    const conn = recordingConnection([
      { status: 200, data: JSON.stringify({ userName: 'systemuser' }) },
    ]);
    process.env.SAP_USERNAME = 'processlogin';
    await expect(requestUserOf(conn as any)).resolves.toBe('SYSTEMUSER');
    expect(conn.requests).toHaveLength(1);
  });
  it('on-premise without the function (404 handed back): the login — the scope login before the process login — never the responsible', async () => {
    const conn = recordingConnection([
      { status: 404, data: '' },
      { status: 404, data: '' },
    ]);
    process.env.SAP_USERNAME = 'processlogin';
    process.env.SAP_RESPONSIBLE = 'SOMEONEELSE';
    await expect(requestUserOf(conn as any)).resolves.toBe('PROCESSLOGIN');
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      await expect(requestUserOf(conn as any)).resolves.toBe('SCOPELOGIN');
    });
  });
  it.each([405, 501, 500])(
    "on-premise a %i handed back is the call's error, never the login",
    async (status) => {
      const conn = recordingConnection([{ status, data: '' }]);
      process.env.SAP_USERNAME = 'processlogin';
      await expect(requestUserOf(conn as any)).rejects.toMatchObject({
        response: { status },
      });
    },
  );
  it('the stated on-premise kind wins over SAP_SYSTEM_TYPE for a connection the factory did not build', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    process.env.SAP_USERNAME = 'processlogin';
    const conn = recordingConnection([{ status: 404, data: '' }]);
    await expect(requestUserOf(conn as any, 'onprem')).resolves.toBe(
      'PROCESSLOGIN',
    );
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
