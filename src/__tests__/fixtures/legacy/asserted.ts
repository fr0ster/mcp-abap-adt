/**
 * Fixture for legacyExposure.test.ts — the form seven handlers use, three of
 * them among the twenty-three this ledger is for.
 *
 * Verbatim from `handleGetClassUnitTestStatus.ts`: `client.getUnitTest() as
 * any` erases the type before the member is ever called, which is invisible
 * to a walk that only knows about calls and identifiers unless `factoryOf`
 * also unwraps an `AsExpression`.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () => {
  const unitTest = client.getUnitTest() as any;
  return unitTest.getStatus({ className: 'ZCL_X' });
};
