/**
 * The one sentence every tool's description but a batch tool's ends with (spec §3, "Wording"): appended at registration
 * (`BaseMcpServer.registerHandlers`, and a registry's own tools through its
 * `registerTool`), so no handler file carries it.
 *
 * Which sentence a tool gets is read from the eligibility table alone
 * (`tools/batch-handlers.json`): a tool every call of which is recorded, a
 * tool recorded only for some arguments (the table's `when` and
 * `connection`, rendered into words), or a tool that runs outside batch
 * mode. The words name no batch tool, so every set uses the same ones.
 */
import {
  absentReadsAs,
  type BatchEntry,
  batchEntries,
  type WhenRule,
} from './eligibility';

/**
 * The sentence of a tool every call of which is recorded (spec §3). The
 * same words serve every set: they name no batch tool.
 */
export const RECORDABLE_SENTENCE =
  'Recordable: in batch mode a call is recorded under the next number and answers with empty content; its answer is read by number after the batch ends.';

/** The sentence of a tool recorded only for some arguments, `when` in words. */
export function recordableWhenSentence(when: string): string {
  return `When ${when}, recordable: in batch mode a call is recorded under the next number and answers with empty content; its answer is read by number after the batch ends.`;
}

/**
 * The sentence of every other tool: one whose request depends on another's
 * answer, one that sends no request, works on a connection of its own (the
 * debugger) or on none (the background-run and leftover-session tools), and
 * a registry's own tool.
 */
export const OUTSIDE_BATCH_SENTENCE = 'Runs outside batch mode.';

const listed = (values: string[]): string =>
  values.length === 1 ? values[0] : values.join(', ');

/** One rule of an entry, in words. */
function ruleWords(tool: string, rule: WhenRule[number]): string[] {
  const words: string[] = [];
  const name = rule.argument;
  if (rule.present === true) words.push(`${name} is given`);
  if (rule.present === false) words.push(`${name} is absent`);
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
        ? `${name} is any value but ${rule.notEquals[0]}`
        : `${name} is any value but ${listed(rule.notEquals)}`,
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
 * The sentence `tool`'s description ends with: recordable for every call,
 * recordable for some arguments (which, from its entries, in words), or —
 * for a tool the eligibility table does not list — run outside batch mode.
 */
export function batchSentence(tool: string): string {
  const entries = batchEntries().filter((entry) => entry.tool === tool);
  if (entries.length === 0) return OUTSIDE_BATCH_SENTENCE;
  const always = entries.some(
    (entry) =>
      (entry.when === undefined || entry.when.length === 0) &&
      entry.connection === undefined,
  );
  if (always) return RECORDABLE_SENTENCE;
  return recordableWhenSentence(entries.map(entryWords).join('; or '));
}

/** `description` with `tool`'s batch sentence appended. */
export function withBatchSentence(description: string, tool: string): string {
  const sentence = batchSentence(tool);
  const trimmed = description.trimEnd();
  return trimmed.length === 0 ? sentence : `${trimmed} ${sentence}`;
}
