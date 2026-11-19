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

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { mockModuleExports } from '../helpers/moduleMock';

// adt-clients replaced for this file before any module under test loads: the
// handlers and src/lib/clients bind it when they load (node:test mock.module,
// helpers/moduleMock.ts; its other exports stay the real ones).
const AdtClientOnPremMock = mock.fn<(...args: any[]) => any>(
  function AdtClientOnPrem() {},
);
const AdtClientCloudMock = mock.fn<(...args: any[]) => any>(
  function AdtClientCloud() {},
);
const AdtClientLegacyMock = mock.fn<(...args: any[]) => any>(
  function AdtClientLegacy() {},
);
const getSystemInformationMock = mock.fn<(...args: any[]) => any>(
  function getSystemInformation() {},
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  AdtClientOnPrem: AdtClientOnPremMock,
  AdtClientCloud: AdtClientCloudMock,
  AdtClientLegacy: AdtClientLegacyMock,
  getSystemInformation: getSystemInformationMock,
});

import type { AdtClientOnPrem } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { createAdtClient } from '../../lib/clients';
import { runWithRequestContext } from '../../lib/requestContext';
import {
  getStatedSystemContext,
  resetSystemContextCache,
} from '../../lib/systemContext';
import { assertMatchObject } from '../helpers/assertions';
import { setSystemContext } from '../helpers/processSystemContext';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const conn = {} as IAbapConnection;

function lastOptions(): ConstructorParameters<typeof AdtClientOnPrem>[2] {
  const calls = AdtClientOnPremMock.mock.calls;
  return calls.at(-1)?.arguments[2];
}

describe('responsible and master system are request-scoped', () => {
  beforeEach(() => {
    resetSystemContextCache();
    AdtClientOnPremMock.mock.resetCalls();
    setSystemContext({
      masterSystem: 'PROC_SYS',
      responsible: 'PROC_USER',
    });
  });

  it('outside any scope, the process context decides', () => {
    createAdtClient(conn);
    assertMatchObject(lastOptions(), {
      responsible: 'PROC_USER',
      masterSystem: 'PROC_SYS',
    });
  });

  it('a scope carrying them wins over the process context', () => {
    runWithRequestContext({ responsible: 'ALICE', masterSystem: 'SID' }, () => {
      createAdtClient(conn);
    });
    assertMatchObject(lastOptions(), {
      responsible: 'ALICE',
      masterSystem: 'SID',
    });
  });

  it('a scope carrying them as undefined does not inherit the process value', () => {
    runWithRequestContext({ responsible: undefined }, () => {
      createAdtClient(conn);
    });
    assert.equal(lastOptions()?.responsible, undefined);
    // masterSystem was not carried, so the process value stays.
    assert.equal(lastOptions()?.masterSystem, 'PROC_SYS');
  });

  it('a scope that only carries the language keeps the process responsible', () => {
    runWithRequestContext({ masterLanguage: 'DE' }, () => {
      createAdtClient(conn);
    });
    assertMatchObject(lastOptions(), {
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
    assert.deepStrictEqual(seen.sort(), ['ALICE:ALICE', 'BOB:BOB']);
  });

  it('a scope does not persist after it ends', () => {
    runWithRequestContext({ responsible: 'ALICE' }, () => {
      createAdtClient(conn);
    });
    createAdtClient(conn);
    assert.equal(lastOptions()?.responsible, 'PROC_USER');
  });

  it('getStatedSystemContext applies the same rule for other readers', () => {
    assert.equal(getStatedSystemContext().responsible, 'PROC_USER');
    runWithRequestContext({ responsible: 'ALICE' }, () => {
      assert.equal(getStatedSystemContext().responsible, 'ALICE');
      assert.equal(getStatedSystemContext().masterSystem, 'PROC_SYS');
    });
  });
});
