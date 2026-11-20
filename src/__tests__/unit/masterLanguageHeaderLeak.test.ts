/**
 * Regression (#110): the per-request/per-session master language
 * (`x-sap-language`) must NOT leak across requests, sessions, or connection
 * modes via the process-global system-context cache. `createAdtClient` reads
 * masterLanguage from the request scope when one is active (HTTP/SSE) and only
 * falls back to the process context outside any scope (stdio).
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
import { resetSystemContextCache } from '../../lib/systemContext';
import { setSystemContext } from '../helpers/processSystemContext';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const conn = {} as IAbapConnection;

function lastOptions(): ConstructorParameters<typeof AdtClientOnPrem>[2] {
  const calls = AdtClientOnPremMock.mock.calls;
  return calls.at(-1)?.arguments[2];
}

describe('masterLanguage does not leak across requests/modes (#110)', () => {
  beforeEach(() => {
    resetSystemContextCache();
    AdtClientOnPremMock.mock.resetCalls();
    // Process-global context: a stale masterLanguage 'EN' plus a system id.
    setSystemContext({
      masterSystem: 'SYS',
      masterLanguage: 'EN',
    });
  });

  it('stdio (no request scope): falls back to process context', () => {
    createAdtClient(conn);
    assert.equal(lastOptions()?.masterLanguage, 'EN');
  });

  it('request scope with x-sap-language: uses the request value', () => {
    runWithRequestContext({ masterLanguage: 'DE' }, () => {
      createAdtClient(conn);
    });
    assert.equal(lastOptions()?.masterLanguage, 'DE');
  });

  it('request scope WITHOUT the header: does NOT inherit the global value', () => {
    // direct-mode request set 'EN' in the global cache earlier; a later
    // broker/header-less request runs in its own scope and must not pick it up.
    runWithRequestContext({ masterLanguage: undefined }, () => {
      createAdtClient(conn);
    });
    assert.equal(lastOptions()?.masterLanguage, undefined);
  });

  it('scope does not persist after it ends', () => {
    runWithRequestContext({ masterLanguage: 'DE' }, () => {
      createAdtClient(conn);
    });
    // back outside any scope → process context again, no 'DE' leak
    createAdtClient(conn);
    assert.equal(lastOptions()?.masterLanguage, 'EN');
  });
});
