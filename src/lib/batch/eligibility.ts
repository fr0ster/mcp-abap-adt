/**
 * Which calls may be recorded into a communication batch: the table
 * `tools/batch-handlers.json`, read once, and nothing else.
 *
 * The one criterion (the owner, 2026-10-16): none of a recorded call's
 * requests needs another's answer — answers arrive only at the batch end, so a
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
import type { ToolArgs, ToolArgValue } from '../handlers/interfaces.js';
import { type JsonValue, jsonAt, jsonOf } from '../json';
import { argMember, isArgList } from '../toolArgValue';

/**
 * One condition on a named argument; an entry's `when` holds when all of them
 * do. With `field`, the argument is a list and `equals` / `notEquals` hold
 * for the member `field` of each of its entries (a list absent has none).
 */
export type WhenRule = {
  argument: string;
  field?: string;
  equals?: string[];
  notEquals?: string[];
  present?: boolean;
}[];

/**
 * The set an entry admits calls of: `compact` for compact batch mode
 * (`HandlerBatch`), `core` for the envelopes of the core and core-ro sets.
 */
export type BatchSet = 'compact' | 'core';

/** The sets an entry may name, in the order the page lists them. */
export const BATCH_SETS: readonly BatchSet[] = ['compact', 'core'];

/** One row of `tools/batch-handlers.json`. */
export interface BatchEntry {
  tool: string;
  /** The set whose calls of `tool` the entry admits. */
  set: BatchSet;
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

let table: readonly BatchEntry[] | undefined;

/** A list of strings, or `undefined` when `value` is not one. */
function stringsOf(value: JsonValue): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === 'string');
  return strings.length === value.length ? strings : undefined;
}

/** One `when` rule of a row, or `undefined` when `value` is not one. */
function whenRuleOf(value: JsonValue): WhenRule[number] | undefined {
  const argument = jsonAt(value, 'argument');
  if (typeof argument !== 'string') return undefined;
  const rule: WhenRule[number] = { argument };
  const field = jsonAt(value, 'field');
  if (field !== undefined) {
    if (typeof field !== 'string') return undefined;
    rule.field = field;
  }
  for (const name of ['equals', 'notEquals'] as const) {
    const given = jsonAt(value, name);
    if (given === undefined) continue;
    const strings = stringsOf(given);
    if (strings === undefined) return undefined;
    rule[name] = strings;
  }
  const present = jsonAt(value, 'present');
  if (present !== undefined) {
    if (typeof present !== 'boolean') return undefined;
    rule.present = present;
  }
  return rule;
}

/**
 * Row `at` of the table, read: the file is data, read as it is written —
 * a row this reading does not recognise stops the load with its index.
 */
export function batchEntryOf(value: JsonValue, at: number): BatchEntry {
  const malformed = () =>
    new Error(`tools/batch-handlers.json: row ${at} is malformed`);
  const tool = jsonAt(value, 'tool');
  const set = jsonAt(value, 'set');
  const handler = jsonAt(value, 'handler');
  const sends = jsonAt(value, 'sends');
  if (
    typeof tool !== 'string' ||
    (set !== 'compact' && set !== 'core') ||
    typeof handler !== 'string' ||
    typeof sends !== 'string'
  ) {
    throw malformed();
  }
  const entry: BatchEntry = { tool, set, handler, sends };
  const when = jsonAt(value, 'when');
  if (when !== undefined) {
    if (!Array.isArray(when)) throw malformed();
    const rules: WhenRule = [];
    for (const given of when) {
      const rule = whenRuleOf(given);
      if (rule === undefined) throw malformed();
      rules.push(rule);
    }
    entry.when = rules;
  }
  const connection = jsonAt(value, 'connection');
  if (connection !== undefined) {
    if (connection !== 'http') throw malformed();
    entry.connection = connection;
  }
  return entry;
}

/** The entries, in file order — loaded at the first use, then kept. */
function loadedEntries(): readonly BatchEntry[] {
  if (table === undefined) {
    // `BATCH_HANDLERS_FILE`, as a literal a bundler inlines.
    // The table, checked once as JSON: typed from here on.
    const file = jsonOf(require('../../../tools/batch-handlers.json'));
    if (!Array.isArray(file)) {
      throw new Error('tools/batch-handlers.json: the table is not a list');
    }
    table = file.map(batchEntryOf);
  }
  return table;
}

/** The entries of `set` naming `tool`, in file order. */
function entriesOf(tool: string, set: BatchSet): BatchEntry[] {
  return loadedEntries().filter(
    (entry) => entry.tool === tool && entry.set === set,
  );
}

/** Every entry of the table, in file order within each tool. */
export function batchEntries(): BatchEntry[] {
  const byTool = new Map<string, BatchEntry[]>();
  for (const entry of loadedEntries()) {
    const listed = byTool.get(entry.tool) ?? [];
    listed.push(entry);
    byTool.set(entry.tool, listed);
  }
  return [...byTool.values()].flat();
}

/**
 * What an absent argument reads as, per tool — the handler's own default:
 * `HandlerGet` reads `part ?? 'source'`, `HandlerLock` `action ?? 'lock'`, `RuntimeListFeeds`
 * `feed_type ?? 'descriptors'`, the unit-test start tools `runner ?? 'async'`.
 */
const ABSENT_READS_AS: Readonly<Record<string, Record<string, string>>> = {
  HandlerGet: { part: 'source' },
  GetFunctionModule: { part: 'source' },
  HandlerLock: { action: 'lock' },
  HandlerUnitTestRun: { runner: 'async' },
  RunUnitTest: { runner: 'async' },
  RunProgramUnitTest: { runner: 'async' },
  RunFunctionGroupUnitTest: { runner: 'async' },
  RunFunctionModuleUnitTest: { runner: 'async' },
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
function compared(value: ToolArgValue): string | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value).toUpperCase();
  }
  return undefined;
}

/**
 * An argument as the call states it, read from the arguments before the
 * tool's schema. An empty list is no argument: the handlers dispatch on a
 * list only when it holds an entry (`HandlerActivate`'s `objects: []` is its
 * single form).
 */
function statedArgument(args: ToolArgs, name: string): ToolArgValue {
  const given = args[name];
  return isArgList(given) && given.length === 0 ? undefined : given;
}

const among = (value: string | undefined, values: string[]) =>
  value !== undefined && values.some((v) => v.toUpperCase() === value);

/** Whether a compared value holds a rule's `equals` and `notEquals`. */
function valueHolds(
  rule: WhenRule[number],
  value: string | undefined,
): boolean {
  if (rule.equals !== undefined && !among(value, rule.equals)) {
    return false;
  }
  return !(rule.notEquals !== undefined && among(value, rule.notEquals));
}

/**
 * Whether every rule of `when` holds for `args`. An argument the call does
 * not state reads as its fallback (`ABSENT_READS_AS`).
 */
export function whenHolds(
  tool: string,
  when: WhenRule | undefined,
  args: ToolArgs,
): boolean {
  for (const rule of when ?? []) {
    const given = statedArgument(args, rule.argument);
    const assumed =
      given === undefined ? absentReadsAs(tool, rule.argument) : undefined;
    const present = given !== undefined || assumed !== undefined;
    if (rule.present !== undefined && present !== rule.present) {
      return false;
    }
    if (rule.field !== undefined) {
      const field = rule.field;
      const members = isArgList(given) ? given : [];
      if (
        !members.every((member) =>
          valueHolds(rule, compared(argMember(member, field))),
        )
      ) {
        return false;
      }
      continue;
    }
    const value =
      given === undefined ? assumed?.toUpperCase() : compared(given);
    if (!valueHolds(rule, value)) return false;
  }
  return true;
}

/**
 * Whether a call of `tool` of `set` with `args` over `connection` may be
 * recorded: some entry of that set naming the tool admits the arguments
 * and the connection. An entry of the other set admits nothing here.
 */
export function eligible(
  tool: string,
  args: ToolArgs,
  connection: 'http' | 'rfc',
  set: BatchSet,
): Eligibility {
  return admits(entriesOf(tool, set), tool, args, connection);
}

/**
 * Whether one of `entries` — the entries of one set naming `tool` — admits
 * a call with `args` over `connection` (`eligible`'s reading, for a given
 * list of entries).
 */
export function admits(
  entries: readonly BatchEntry[],
  tool: string,
  args: ToolArgs,
  connection: 'http' | 'rfc',
): Eligibility {
  if (entries.length === 0) return { ok: false, reason: 'not-listed' };
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
