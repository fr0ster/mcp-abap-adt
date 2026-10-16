/**
 * The one sentence every tool's description but a batch tool's ends with (spec §3, "Wording"): appended at registration
 * (`BaseMcpServer.registerHandlers`, and a registry's own tools through its
 * `registerTool`), so no handler file carries it.
 *
 * Which sentence a tool gets is read from the eligibility table alone
 * (`tools/batch-handlers.json`): a tool every call of which is recorded, a
 * tool recorded only for some arguments (the table's `when` and
 * `connection`, rendered into words), or a tool refused. The compact sets
 * name `HandlerBatch` and its actions where the full sets name a tool.
 */
import type { ToolSetKind } from '../config/binaries';
import {
  absentReadsAs,
  type BatchEntry,
  batchEntries,
  type WhenRule,
} from './eligibility';

/** How a set names beginning, ending and reading a batch. */
interface Names {
  begin: string;
  end: string;
  answers: string;
}

const FULL_NAMES: Names = {
  begin: 'BatchBegin',
  end: 'BatchEnd',
  answers: 'BatchAnswers',
};

const COMPACT_NAMES: Names = {
  begin: "HandlerBatch action 'begin'",
  end: "HandlerBatch action 'end'",
  answers: "HandlerBatch action 'answers'",
};

const namesOf = (set: ToolSetKind): Names =>
  set === 'compact' || set === 'compact-ro' ? COMPACT_NAMES : FULL_NAMES;

/** The sentence of a tool every call of which is recorded. */
export function eligibleSentence(set: ToolSetKind): string {
  const names = namesOf(set);
  return `In batch mode (${names.begin}) a call is recorded and returns nothing; calls are numbered in the order made, and their answers are read by number with ${names.answers} once ${names.end} has run.`;
}

/** The sentence of a tool refused in batch mode. */
export function ineligibleSentence(set: ToolSetKind): string {
  return `In batch mode (${namesOf(set).begin}) this tool is refused: a request of it depends on another's answer.`;
}

const listed = (values: string[]): string =>
  values.length === 1 ? values[0] : values.join(', ');

/** One rule of an entry, in words. */
function ruleWords(tool: string, rule: WhenRule[number]): string[] {
  const words: string[] = [];
  const name = rule.argument;
  if (rule.present === true) words.push(`${name} is given`);
  if (rule.present === false) words.push(`${name} is not given`);
  if (rule.equals !== undefined) {
    const absent = absentReadsAs(tool, name);
    const fallback =
      absent !== undefined &&
      rule.equals.some((v) => v.toUpperCase() === absent.toUpperCase())
        ? ` (absent reads as ${absent})`
        : '';
    words.push(
      rule.equals.length === 1
        ? `${name} is ${rule.equals[0]}${fallback}`
        : `${name} is one of ${listed(rule.equals)}${fallback}`,
    );
  }
  if (rule.notEquals !== undefined) {
    words.push(
      rule.notEquals.length === 1
        ? `${name} is not ${rule.notEquals[0]}`
        : `${name} is none of ${listed(rule.notEquals)}`,
    );
  }
  return words;
}

/**
 * One entry's arguments and connection, in words — `''` for an entry that
 * admits every call (the eligibility page renders the table with it).
 */
export function entryWords(entry: BatchEntry): string {
  const rules = (entry.when ?? []).flatMap((rule) =>
    ruleWords(entry.tool, rule),
  );
  if (entry.connection === 'http') rules.push('the connection is HTTP');
  return rules.join(' and ');
}

/**
 * The sentence `tool`'s description ends with in a set of `set`'s kind:
 * recorded, recorded only for some arguments (which, from its entries), or
 * refused. A tool the eligibility table does not list is refused.
 */
export function batchSentence(tool: string, set: ToolSetKind): string {
  const entries = batchEntries().filter((entry) => entry.tool === tool);
  if (entries.length === 0) return ineligibleSentence(set);
  const always = entries.some(
    (entry) =>
      (entry.when === undefined || entry.when.length === 0) &&
      entry.connection === undefined,
  );
  if (always) return eligibleSentence(set);
  const cases = entries.map(entryWords);
  return `${eligibleSentence(set)} Only these calls are recorded, any other is refused: ${cases.join('; or ')}.`;
}

/** `description` with `tool`'s batch sentence appended. */
export function withBatchSentence(
  description: string,
  tool: string,
  set: ToolSetKind,
): string {
  const sentence = batchSentence(tool, set);
  const trimmed = description.trimEnd();
  return trimmed.length === 0 ? sentence : `${trimmed} ${sentence}`;
}
