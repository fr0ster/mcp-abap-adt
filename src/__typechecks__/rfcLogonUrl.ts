/**
 * The RFC configuration carries no `url` (spec §3, plan S2f): the contract
 * declares `ISapRfcLogon.url?: never`, and under `exactOptionalPropertyTypes`
 * that refuses `url: undefined` too — the hole the construction scan
 * (`configConstructionScan.ts`) only approximated. Checked by `test:check`,
 * whose configuration extends the root one; never emitted. Without the option
 * the assignment compiles and the directive is unused: `test:check` fails.
 */

import type { ISapRfcLogon } from '@mcp-abap-adt/interfaces-auth-sap';

declare const logon: ISapRfcLogon;

// @ts-expect-error an RFC logon takes no `url`, not even `undefined`
export const withUrl: ISapRfcLogon = { ...logon, url: undefined };
