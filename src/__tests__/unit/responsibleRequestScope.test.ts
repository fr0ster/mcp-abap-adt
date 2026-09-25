/**
 * The responsible person and master system for created objects must be
 * settable per request, the way the master language already is (#110).
 *
 * An embedding host that serves several SAP users from one process cannot keep
 * them in the process-global system context: two concurrent requests would
 * create objects under whichever user wrote last. Inside a request scope that
 * carries them, `createAdtClient` reads them from the scope. A scope that does
 * not carry them leaves the process context in charge, so a host that only
 * scopes the language keeps the responsible it resolved from its environment
 * or the system.
 */
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  AdtClient: jest.fn(),
  AdtClientLegacy: jest.fn(),
  getSystemInformation: jest.fn(),
}));

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt';
import { createAdtClient } from '../../lib/clients';
import { runWithRequestContext } from '../../lib/requestContext';
import {
  getEffectiveSystemContext,
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';

const conn = {} as IAbapConnection;

type Options =
  | { responsible?: string; masterSystem?: string; masterLanguage?: string }
  | undefined;

function lastOptions(): Options {
  const calls = (AdtClient as jest.Mock).mock.calls;
  return calls.at(-1)?.[2];
}

describe('responsible and master system are request-scoped', () => {
  beforeEach(() => {
    resetSystemContextCache();
    (AdtClient as jest.Mock).mockClear();
    setSystemContext({
      masterSystem: 'PROC_SYS',
      responsible: 'PROC_USER',
    });
  });

  it('outside any scope, the process context decides', () => {
    createAdtClient(conn);
    expect(lastOptions()).toMatchObject({
      responsible: 'PROC_USER',
      masterSystem: 'PROC_SYS',
    });
  });

  it('a scope carrying them wins over the process context', () => {
    runWithRequestContext({ responsible: 'ALICE', masterSystem: 'E19' }, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()).toMatchObject({
      responsible: 'ALICE',
      masterSystem: 'E19',
    });
  });

  it('a scope carrying them as undefined does not inherit the process value', () => {
    runWithRequestContext({ responsible: undefined }, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()?.responsible).toBeUndefined();
    // masterSystem was not carried, so the process value stays.
    expect(lastOptions()?.masterSystem).toBe('PROC_SYS');
  });

  it('a scope that only carries the language keeps the process responsible', () => {
    runWithRequestContext({ masterLanguage: 'DE' }, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()).toMatchObject({
      responsible: 'PROC_USER',
      masterSystem: 'PROC_SYS',
      masterLanguage: 'DE',
    });
  });

  it('two concurrent scopes each see their own responsible', async () => {
    const seen: string[] = [];
    const run = (user: string, delayMs: number) =>
      runWithRequestContext({ responsible: user }, async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        createAdtClient(conn);
        seen.push(`${user}:${lastOptions()?.responsible}`);
      });
    await Promise.all([run('ALICE', 20), run('BOB', 5)]);
    expect(seen.sort()).toEqual(['ALICE:ALICE', 'BOB:BOB']);
  });

  it('a scope does not persist after it ends', () => {
    runWithRequestContext({ responsible: 'ALICE' }, () => {
      createAdtClient(conn);
    });
    createAdtClient(conn);
    expect(lastOptions()?.responsible).toBe('PROC_USER');
  });

  it('getEffectiveSystemContext applies the same rule for other readers', () => {
    expect(getEffectiveSystemContext().responsible).toBe('PROC_USER');
    runWithRequestContext({ responsible: 'ALICE' }, () => {
      expect(getEffectiveSystemContext().responsible).toBe('ALICE');
      expect(getEffectiveSystemContext().masterSystem).toBe('PROC_SYS');
    });
  });
});
