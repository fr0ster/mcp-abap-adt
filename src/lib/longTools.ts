/**
 * The listed long tools: the approved list — reads only —, the `background`
 * parameter every listed tool declares, and the words its description
 * carries. A leaf module — no import of the server's — so every handler's
 * definition can read it; the call itself is `longCall.ts` (in the call) or
 * `backgroundRuns/run.ts` (in the background).
 *
 * One rule (the owner, 2026-11-07): a listed tool only reads and runs on an
 * ABAP session of its own. By default it runs in the background and the
 * call answers a `run_handle` at once; `background: false` answers the
 * result in the call. A running read is cancelled by `DiscardBackgroundRun`:
 * its own session is logged off, and nothing was changed. No deadline of
 * the server's: a read ends when SAP answers or when it is cancelled.
 */

import * as z from 'zod';
import { child } from './xml/tree';

/**
 * The approved list, by tool name: the same names as
 * `tools/long-handlers.json`, which a source test keeps equal to this.
 */
export const LONG_TOOLS: readonly string[] = [
  'GetWhereUsed',
  'SearchObject',
  'SearchSource',
  'GetPackageContents',
  'GetPackageTree',
  'GetObjectsList',
  'GetStructuresList',
  'GetIncludesList',
  'RuntimeListFeeds',
  'ListTransports',
  'GetSqlQuery',
  'GetTableContents',
  'GetObjectInfo',
  'DescribeByList',
  'GetATCFindings',
  'ListATCResults',
  'GetATCResult',
  'RuntimeGetProfilerTraceData',
  'RuntimeAnalyzeProfilerTrace',
  'HandlerWhereUsed',
  'HandlerSearch',
  'HandlerDumpList',
  'HandlerGetData',
  'HandlerProfileView',
  'HandlerGet',
];

const LISTED = new Set(LONG_TOOLS);

/** Whether `name` is a listed long tool. */
export function isLongTool(name: string): boolean {
  return LISTED.has(name);
}

/**
 * The modes of a listed tool that are not reads: `HandlerGet` of a
 * `UNIT_TEST` / `CDS_UNIT_TEST` run reads a unit-test run's result by its
 * id, and its parts `activation_status` / `activation_results` read an
 * activation run by its id. Such a call is an ordinary one — the instance's
 * connection, in the call — and a `background` on it is refused
 * (`BACKGROUND_NOT_FOR_RUN_WORDS`), before anything is sent. A call is in a
 * run mode when any one rule of its tool holds.
 */
const NOT_A_READ: Readonly<
  Record<string, ReadonlyArray<{ argument: string; equals: readonly string[] }>>
> = {
  HandlerGet: [
    { argument: 'object_type', equals: ['UNIT_TEST', 'CDS_UNIT_TEST'] },
    {
      argument: 'part',
      equals: ['ACTIVATION_STATUS', 'ACTIVATION_RESULTS', 'DRAFT'],
    },
  ],
};

/** Whether a call of the listed `tool` with `args` is a read (the long path). */
export function isLongRead(tool: string, args: unknown): boolean {
  const rules = NOT_A_READ[tool];
  if (rules === undefined) return true;
  return !rules.some((rule) => {
    const value = child(args, rule.argument);
    return (
      typeof value === 'string' && rule.equals.includes(value.toUpperCase())
    );
  });
}

/** The fixed words of a `background` given to a listed tool's run mode. */
export const BACKGROUND_NOT_FOR_RUN_WORDS =
  'background applies to a read only: a unit test run (UNIT_TEST / CDS_UNIT_TEST) and an activation run (activation_status / activation_results) are read in the call and take none.';

/**
 * The words every listed tool's description carries. A description names
 * no other tool of its set (the functional-descriptions guard): the tools
 * that read and cancel a run are named in the `background` parameter.
 */
export const LONG_TOOL_ADVICE =
  'Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.';

/**
 * The words a listed tool's description carries where it is listed without
 * `background` (no strategy, or no tool reading the runs): it answers in
 * the call.
 */
export const LONG_TOOL_IN_CALL_ADVICE =
  'Runs on an ABAP session of its own and answers its result in the call.';

/** The `background` property of a listed full tool. */
export const LONG_BACKGROUND_DESCRIPTION =
  'Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.';

/** The `background` property of a listed compact tool. */
export const COMPACT_LONG_BACKGROUND_DESCRIPTION =
  'Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself.';

/** The `background` field of a listed full tool's zod input schema. */
export const LONG_BACKGROUND_FIELD = z
  .boolean()
  .optional()
  .describe(LONG_BACKGROUND_DESCRIPTION);

/** The `background` field of a listed compact tool's zod input schema. */
export const COMPACT_LONG_BACKGROUND_FIELD = z
  .boolean()
  .optional()
  .describe(COMPACT_LONG_BACKGROUND_DESCRIPTION);

/**
 * A listed read's `background`: `true` when not given (the default),
 * `null` when given and not a boolean.
 */
export function readLongBackground(args: unknown): boolean | null {
  const value = child(args, 'background');
  if (value === undefined) return true;
  return typeof value === 'boolean' ? value : null;
}

/** Whether a call states `background` at all. */
export function statesBackground(args: unknown): boolean {
  return child(args, 'background') !== undefined;
}

/** A listed tool's description, with the words every listed tool carries. */
export function withLongToolAdvice(description: string): string {
  return `${description} ${LONG_TOOL_ADVICE}`;
}
