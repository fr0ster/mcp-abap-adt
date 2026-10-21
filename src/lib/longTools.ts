/**
 * The listed long tools: the approved list — reads only —,
 * the `timeout` parameter every listed tool declares, and the advice its
 * description carries. A leaf module — no import of the server's — so every
 * handler's definition can read it; the call itself is `longCall.ts`.
 *
 * One rule (the owner, 2026-10-13): a listed tool only reads, so when its
 * `timeout` passes the read is cut — its own connection is logged off at
 * once — and nothing was changed. A tool that starts a run in SAP or runs
 * code is not on the list and takes no `timeout`.
 */

import * as z from 'zod';

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
  'GetAbapSystemSymbols',
  'GetATCFindings',
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
 * id, and its parts
 * `activation_status` / `activation_results` read an activation run by its
 * id. Such a call is an ordinary one — the instance's connection — and a
 * `timeout` on it is refused (`TIMEOUT_NOT_FOR_RUN_WORDS`), before anything
 * is sent. A call is in a run mode when any one rule of its tool holds.
 */
const NOT_A_READ: Readonly<
  Record<string, ReadonlyArray<{ argument: string; equals: readonly string[] }>>
> = {
  HandlerGet: [
    { argument: 'object_type', equals: ['UNIT_TEST', 'CDS_UNIT_TEST'] },
    { argument: 'part', equals: ['ACTIVATION_STATUS', 'ACTIVATION_RESULTS'] },
  ],
};

/** Whether a call of the listed `tool` with `args` is a read (the long path). */
export function isLongRead(tool: string, args: unknown): boolean {
  const rules = NOT_A_READ[tool];
  if (rules === undefined) return true;
  const given = args as Record<string, unknown> | null | undefined;
  return !rules.some((rule) => {
    const value = given?.[rule.argument];
    return (
      typeof value === 'string' && rule.equals.includes(value.toUpperCase())
    );
  });
}

/** The fixed words of a `timeout` given to a listed tool's run mode. */
export const TIMEOUT_NOT_FOR_RUN_WORDS =
  'timeout applies to a read only: a unit test run (UNIT_TEST / CDS_UNIT_TEST) and an activation run (activation_status / activation_results) take none.';

/**
 * The largest `timeout` a timer can hold: Node fires a longer delay at once
 * (`TimeoutOverflowWarning`), so a larger value is refused, not shortened.
 */
export const MAX_TIMEOUT_SECONDS = 2_147_483;

/**
 * The advice every listed tool's description carries: what the
 * `timeout` does, and why to set it below the client's own limit.
 */
export const LONG_TOOL_ADVICE =
  "Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.";

const TIMEOUT_DESCRIPTION =
  "Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.";

/** The `timeout` property of a listed tool's JSON Schema. */
export const TIMEOUT_PROPERTY = {
  type: 'integer',
  minimum: 1,
  maximum: MAX_TIMEOUT_SECONDS,
  description: TIMEOUT_DESCRIPTION,
} as const;

/** The `timeout` field of a listed tool declared as a zod raw shape. */
export function timeoutField() {
  return z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_SECONDS)
    .optional()
    .describe(TIMEOUT_DESCRIPTION);
}

/** The fixed words of a read its `timeout` cut. */
export function timedOutWords(seconds: number): string {
  return `The wait was ended by its timeout (${seconds} s). The request was cancelled; nothing was changed.`;
}

/** The answer of a call whose `timeout` cut its read. */
export interface TimedOutAnswer {
  isError: true;
  content: { type: 'text'; text: string }[];
}

export function timedOutAnswer(seconds: number): TimedOutAnswer {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          timed_out: true,
          timeout: seconds,
          message: timedOutWords(seconds),
        }),
      },
    ],
  };
}

/** The fixed words of a `timeout` that is not a whole number in range. */
export const TIMEOUT_INVALID_WORDS = `timeout must be a whole number of seconds from 1 to ${MAX_TIMEOUT_SECONDS}.`;

/**
 * The call's `timeout` in seconds, `undefined` when not given; `null` when
 * given and invalid.
 */
export function readTimeout(args: unknown): number | undefined | null {
  const value = (args as { timeout?: unknown } | null | undefined)?.timeout;
  if (value === undefined) return undefined;
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TIMEOUT_SECONDS
    ? value
    : null;
}

/** The arguments a handler receives: the call's own `timeout` is the wrapper's, not the handler's. */
export function withoutTimeout<T>(args: T): T {
  if (args === null || typeof args !== 'object' || !('timeout' in args)) {
    return args;
  }
  const { timeout: _taken, ...rest } = args as Record<string, unknown>;
  return rest as T;
}

/** A listed tool's description, with the advice every listed tool carries. */
export function withLongToolAdvice(description: string): string {
  return `${description} ${LONG_TOOL_ADVICE}`;
}
