/**
 * Regression (#110): the per-request/per-session master language
 * (`x-sap-language`) must NOT leak across requests, sessions, or connection
 * modes via the process-global system-context cache. `createAdtClient` reads
 * masterLanguage from the request scope when one is active (HTTP/SSE) and only
 * falls back to the process context outside any scope (stdio).
 */
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  AdtClient: jest.fn(),
  AdtClientLegacy: jest.fn(),
  getSystemInformation: jest.fn(),
}));

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { createAdtClient } from '../../lib/clients';
import { runWithRequestContext } from '../../lib/requestContext';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';

const conn = {} as IAbapConnection;

function lastOptions(): { masterLanguage?: string } | undefined {
  const calls = (AdtClient as jest.Mock).mock.calls;
  return calls.at(-1)?.[2];
}

describe('masterLanguage does not leak across requests/modes (#110)', () => {
  beforeEach(() => {
    resetSystemContextCache();
    (AdtClient as jest.Mock).mockClear();
    // Process-global context: a stale masterLanguage 'EN' plus a system id.
    setSystemContext({
      isLegacy: false,
      masterSystem: 'SYS',
      masterLanguage: 'EN',
    });
  });

  it('stdio (no request scope): falls back to process context', () => {
    createAdtClient(conn);
    expect(lastOptions()?.masterLanguage).toBe('EN');
  });

  it('request scope with x-sap-language: uses the request value', () => {
    runWithRequestContext({ masterLanguage: 'DE' }, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()?.masterLanguage).toBe('DE');
  });

  it('request scope WITHOUT the header: does NOT inherit the global value', () => {
    // direct-mode request set 'EN' in the global cache earlier; a later
    // broker/header-less request runs in its own scope and must not pick it up.
    runWithRequestContext({ masterLanguage: undefined }, () => {
      createAdtClient(conn);
    });
    expect(lastOptions()?.masterLanguage).toBeUndefined();
  });

  it('scope does not persist after it ends', () => {
    runWithRequestContext({ masterLanguage: 'DE' }, () => {
      createAdtClient(conn);
    });
    // back outside any scope → process context again, no 'DE' leak
    createAdtClient(conn);
    expect(lastOptions()?.masterLanguage).toBe('EN');
  });
});
