/**
 * Which calls may be recorded into a communication batch: the table
 * `tools/batch-handlers.json`, read once, and nothing else.
 *
 * The one criterion (the owner, 2026-10-16): none of a recorded call's
 * requests needs another's answer — answers arrive only at `BatchEnd`, so a
 * handler that reads a first answer to build or decide a second request (a
 * create then its activation, a fallback after a `404`, a poll) cannot be
 * recorded; several requests sent together can. Long reads are judged the
 * same way. Every entry is proven by running its handler held open and
 * answered (`oneRequestPerEntry.test.ts`); a tool not listed, or a call whose
 * arguments no entry admits, is refused.
 *
 * An entry may narrow its tool with `when` — every rule must hold — and with
 * `connection: 'http'` when its one request holds only over HTTP (a package
 * lock over RFC opens an ABAP session of its own, outside the batch).
 */

import * as path from 'node:path';

/** One condition on a named argument; an entry's `when` holds when all of them do. */
export type WhenRule = {
  argument: string;
  equals?: string[];
  notEquals?: string[];
  present?: boolean;
}[];

/** One row of `tools/batch-handlers.json`. */
export interface BatchEntry {
  tool: string;
  set: 'full' | 'compact';
  /** `path#function`, from the repository root. */
  handler: string;
  /** The requests the call sends, in words. */
  sends: string;
  when?: WhenRule;
  connection?: 'http';
}

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: 'not-listed' | 'arguments' | 'connection' };

/**
 * The table's place: `tools/` at the package root, three levels above this
 * module both in `src/lib/batch` and in `dist/lib/batch` (the package ships
 * the file, `package.json` `files`). The table is loaded by a `require` of
 * this same place written as a literal, so a bundler (the portable build's
 * single executable, which has no file beside its code) carries it inside.
 */
export const BATCH_HANDLERS_FILE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tools',
  'batch-handlers.json',
);

let table: ReadonlyMap<string, readonly BatchEntry[]> | undefined;

/** The entries, by tool — loaded at the first use, then kept. */
function entriesByTool(): ReadonlyMap<string, readonly BatchEntry[]> {
  if (table === undefined) {
    // `BATCH_HANDLERS_FILE`, as a literal a bundler inlines.
    const entries =
      require('../../../tools/batch-handlers.json') as readonly BatchEntry[];
    const byTool = new Map<string, BatchEntry[]>();
    for (const entry of entries) {
      const listed = byTool.get(entry.tool) ?? [];
      listed.push(entry);
      byTool.set(entry.tool, listed);
    }
    table = byTool;
  }
  return table;
}

/** Every entry of the table, in file order within each tool. */
export function batchEntries(): BatchEntry[] {
  return [...entriesByTool().values()].flat();
}

/**
 * What an absent argument reads as, per tool — the handler's own default:
 * `HandlerGet` reads `part ?? 'source'`, `RuntimeListFeeds`
 * `feed_type ?? 'descriptors'`, `HandlerUnitTestRun` `runner ?? 'sync'`.
 */
const ABSENT_READS_AS: Readonly<Record<string, Record<string, string>>> = {
  HandlerGet: { part: 'source' },
  HandlerUnitTestRun: { runner: 'sync' },
  RuntimeListFeeds: { feed_type: 'descriptors' },
};

/** What `tool`'s absent `argument` reads as, or `undefined` when nothing is assumed. */
export function absentReadsAs(
  tool: string,
  argument: string,
): string | undefined {
  return ABSENT_READS_AS[tool]?.[argument];
}

/** An argument's value as the rules compare it: a string or boolean, upper-cased. */
function compared(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value).toUpperCase();
  }
  return undefined;
}

function argumentOf(tool: string, args: unknown, name: string): unknown {
  const given =
    args !== null && typeof args === 'object'
      ? (args as Record<string, unknown>)[name]
      : undefined;
  return given === undefined ? ABSENT_READS_AS[tool]?.[name] : given;
}

const among = (value: string | undefined, values: string[]) =>
  value !== undefined && values.some((v) => v.toUpperCase() === value);

/** Whether every rule of `when` holds for `args`. */
export function whenHolds(
  tool: string,
  when: WhenRule | undefined,
  args: unknown,
): boolean {
  for (const rule of when ?? []) {
    const value = argumentOf(tool, args, rule.argument);
    if (rule.present !== undefined && (value !== undefined) !== rule.present) {
      return false;
    }
    if (rule.equals !== undefined && !among(compared(value), rule.equals)) {
      return false;
    }
    if (
      rule.notEquals !== undefined &&
      among(compared(value), rule.notEquals)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a call of `tool` with `args` over `connection` may be recorded:
 * some entry of the tool admits the arguments and the connection.
 */
export function eligible(
  tool: string,
  args: unknown,
  connection: 'http' | 'rfc',
): Eligibility {
  const entries = entriesByTool().get(tool);
  if (entries === undefined) return { ok: false, reason: 'not-listed' };
  const admitted = entries.filter((e) => whenHolds(tool, e.when, args));
  if (admitted.length === 0) return { ok: false, reason: 'arguments' };
  if (
    admitted.some(
      (e) => e.connection === undefined || e.connection === connection,
    )
  ) {
    return { ok: true };
  }
  return { ok: false, reason: 'connection' };
}
