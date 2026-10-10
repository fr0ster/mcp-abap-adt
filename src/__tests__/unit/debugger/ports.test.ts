import { requestUserOf } from '../../../lib/debugger/ports';
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
