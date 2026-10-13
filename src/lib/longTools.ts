/**
 * The listed long tools (spec §5.8, D56): the approved list with each tool's
 * mode, the `timeout` parameter every listed tool declares, the advice its
 * description carries, and the ids a timed-out answer names. A leaf module — no import of the
 * server's — so every handler's definition can read it; the call itself is
 * `longCall.ts`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import * as z from 'zod';

/**
 * The approved list (the user, 2026-10-13), by tool name: the same names as
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
  'RunATC',
  'RunUnitTest',
  'RunCdsUnitTest',
  'RunProgramUnitTest',
  'RunFunctionGroupUnitTest',
  'RunFunctionModuleUnitTest',
  'GetUnitTestResult',
  'RuntimeRunClass',
  'RuntimeRunProgram',
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
  'HandlerUnitTestResult',
  'HandlerCdsUnitTestResult',
  'HandlerProfileRun',
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
 * The largest `timeout` a timer can hold: Node fires a longer delay at once
 * (`TimeoutOverflowWarning`), so a larger value is refused, not shortened.
 */
export const MAX_TIMEOUT_SECONDS = 2_147_483;

/**
 * The advice every listed tool's description carries (spec §5.8): what the
 * `timeout` does, and why to set it below the client's own limit.
 */
export const LONG_TOOL_ADVICE =
  "Runs on an ABAP session of its own. Optional timeout (seconds) ends the wait: a read is cancelled, a started run goes on in SAP (read it later by its id), a run of code goes on to its end; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.";

const TIMEOUT_DESCRIPTION =
  "Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the call answers at once: a read is cancelled and nothing was changed; a started run goes on in SAP and the answer names it (run_id / worklist_id) to read later; a run of code goes on to its end in SAP and its answer is not reported. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.";

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

/**
 * What a `timeout` does to a listed tool's work depends on where that work
 * runs in SAP — measured on premise (2026-10-13), decided by the owner:
 *
 * - **`sync-write`** — the work runs inside one synchronous request and can
 *   change the system (a class or program run; an ATC run held with
 *   `wait=true`, unmeasured, treated so to be safe). A closed socket or a
 *   logoff kills it and loses its write, so the timeout ends only the wait:
 *   the request runs on on the call's own connection, logged off after SAP's
 *   answer; the orderly shutdown waits for that answer;
 * - **`async`** — the tool starts a run in SAP, or polls one; the run
 *   survives the client's exit and a logoff of the session that started it
 *   (measured with ABAP Unit). The timeout ends the wait: the poll stops, the
 *   answer names the run (`run_id` / `worklist_id`), and the call's own
 *   connection is logged off at once;
 * - **`sync-read`** — the request only reads. The timeout cuts it: the call's
 *   own connection is logged off at once, which frees SAP; nothing was
 *   changed.
 */
export type LongMode = 'sync-write' | 'async' | 'sync-read';

/**
 * A listed tool's mode: its own, or one an argument decides (`when`, the
 * first rule whose argument has one of the values; `mode` otherwise).
 */
export interface LongModeRule {
  mode: LongMode;
  when?: { argument: string; equals: unknown[]; mode: LongMode }[];
}

/**
 * Each listed tool's mode — the same as `tools/long-handlers.json`'s, which
 * a source test keeps equal to this, so a tool's mode is reviewable there.
 */
export const LONG_TOOL_MODES: Readonly<Record<string, LongModeRule>> = {
  GetWhereUsed: { mode: 'sync-read' },
  SearchObject: { mode: 'sync-read' },
  SearchSource: { mode: 'sync-read' },
  GetPackageContents: { mode: 'sync-read' },
  GetPackageTree: { mode: 'sync-read' },
  GetObjectsList: { mode: 'sync-read' },
  GetStructuresList: { mode: 'sync-read' },
  GetIncludesList: { mode: 'sync-read' },
  RunATC: {
    mode: 'async',
    when: [{ argument: 'wait', equals: [true], mode: 'sync-write' }],
  },
  RunUnitTest: { mode: 'async' },
  RunCdsUnitTest: { mode: 'async' },
  RunProgramUnitTest: { mode: 'async' },
  RunFunctionGroupUnitTest: { mode: 'async' },
  RunFunctionModuleUnitTest: { mode: 'async' },
  GetUnitTestResult: { mode: 'async' },
  RuntimeRunClass: { mode: 'sync-write' },
  RuntimeRunProgram: { mode: 'sync-write' },
  RuntimeListFeeds: { mode: 'sync-read' },
  ListTransports: { mode: 'sync-read' },
  GetSqlQuery: { mode: 'sync-read' },
  GetTableContents: { mode: 'sync-read' },
  GetObjectInfo: { mode: 'sync-read' },
  DescribeByList: { mode: 'sync-read' },
  GetAbapSystemSymbols: { mode: 'sync-read' },
  GetATCFindings: { mode: 'sync-read' },
  RuntimeGetProfilerTraceData: { mode: 'sync-read' },
  RuntimeAnalyzeProfilerTrace: { mode: 'sync-read' },
  HandlerWhereUsed: { mode: 'sync-read' },
  HandlerSearch: { mode: 'sync-read' },
  HandlerUnitTestResult: { mode: 'async' },
  HandlerCdsUnitTestResult: { mode: 'async' },
  HandlerProfileRun: { mode: 'sync-write' },
  HandlerDumpList: { mode: 'sync-read' },
  HandlerGetData: { mode: 'sync-read' },
  HandlerProfileView: { mode: 'sync-read' },
  HandlerGet: {
    mode: 'sync-read',
    when: [
      {
        argument: 'object_type',
        equals: ['UNIT_TEST', 'CDS_UNIT_TEST'],
        mode: 'async',
      },
    ],
  },
};

/** The mode of a call of `tool` with `args`. */
export function longToolMode(tool: string, args: unknown): LongMode {
  const rule = LONG_TOOL_MODES[tool];
  if (rule === undefined) throw new Error(`${tool} is not a listed long tool`);
  for (const condition of rule.when ?? []) {
    const value = (args as Record<string, unknown> | null | undefined)?.[
      condition.argument
    ];
    const read = typeof value === 'string' ? value.toUpperCase() : value;
    if (condition.equals.includes(read)) return condition.mode;
  }
  return rule.mode;
}

/** What a tool already holds when its wait ends: `run_id`, `worklist_id`. */
export type LongCallId = 'run_id' | 'worklist_id';

/** A long call's progress, as its handler sees it. */
export interface LongCallProgress {
  /** The ids the tool holds so far. */
  readonly ids: Map<LongCallId, string>;
  /** Set when the `timeout` ended the wait of an `async` call: stop polling. */
  waitEnded: boolean;
}

const progressScope = new AsyncLocalStorage<LongCallProgress>();

/** Runs `fn` with `progress` collecting what its handler records. */
export function withLongCallProgress<T>(
  progress: LongCallProgress,
  fn: () => T,
): T {
  return progressScope.run(progress, fn);
}

/**
 * Records an id the timed-out answer carries (spec §5.8: `worklist_id` /
 * `run_id` where the tool holds one at that moment). Outside a long call it
 * does nothing.
 */
export function noteLongCallId(key: LongCallId, value: unknown): void {
  if (typeof value !== 'string' || value === '') return;
  progressScope.getStore()?.ids.set(key, value);
}

/**
 * Whether the wait of the long call this code runs for was ended by its
 * `timeout` — a poll loop stops here (an `async` call). Outside a long call:
 * never.
 */
export function longCallWaitEnded(): boolean {
  return progressScope.getStore()?.waitEnded === true;
}

/** The fixed words of a wait its `timeout` ended, per mode. */
export function timedOutWords(
  seconds: number,
  mode: LongMode,
  ids: ReadonlyMap<LongCallId, string> = new Map(),
): string {
  const ended = `The wait was ended by its timeout (${seconds} s).`;
  if (mode === 'sync-write') {
    return `${ended} The request is still running in SAP, which finishes it on its own; its answer will not be reported.`;
  }
  if (mode === 'sync-read') {
    return `${ended} The request was cancelled; nothing was changed.`;
  }
  const named = [...ids].map(([key, value]) => `${key} ${value}`).join(', ');
  return named === ''
    ? `${ended} The run continues in SAP; its id had not been received when the wait ended.`
    : `${ended} The run continues in SAP; read it later with ${named}.`;
}

/** The answer of a call whose `timeout` ended its wait. */
export interface TimedOutAnswer {
  isError: true;
  content: { type: 'text'; text: string }[];
}

export function timedOutAnswer(
  seconds: number,
  mode: LongMode,
  ids: ReadonlyMap<LongCallId, string>,
): TimedOutAnswer {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          timed_out: true,
          timeout: seconds,
          message: timedOutWords(seconds, mode, ids),
          ...Object.fromEntries(ids),
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
