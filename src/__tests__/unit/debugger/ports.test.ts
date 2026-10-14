import { liveDebugPorts, requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { recordingConnection } from '../../helpers/recordingConnection';

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
      expect(requestUserOf()).toBe('RESP_USER');
    });
  });
  it('no responsible: the scope login before the process login', async () => {
    process.env.SAP_USERNAME = 'processlogin';
    expect(requestUserOf()).toBe('PROCESSLOGIN');
    await runWithRequestContext({ login: 'scopelogin' }, async () => {
      expect(requestUserOf()).toBe('SCOPELOGIN');
    });
  });
  it('neither: system_user_unknown', () => {
    delete process.env.SAP_USERNAME;
    expect(() => requestUserOf()).toThrow(
      expect.objectContaining({ serverRefusal: 'system_user_unknown' }),
    );
  });
  it('the live ports ask the stated value, not the connection', async () => {
    process.env.SAP_USERNAME = 'processlogin';
    const conn = recordingConnection([]);
    await expect(
      liveDebugPorts().requestUser({ connection: conn as never }),
    ).resolves.toBe('PROCESSLOGIN');
    expect(conn.requests).toHaveLength(0);
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
