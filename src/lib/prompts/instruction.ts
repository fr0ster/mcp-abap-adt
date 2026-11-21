/**
 * The instruction's text, rendered from its steps: one line per step, then
 * the arguments still to fill and the notes. Every value the user gave is a
 * JSON literal, so a quote or a line break in it stays inside the literal.
 */
import type { JsonValue } from '../json.js';
import type { ArgumentValue, PromptInstruction, PromptStep } from './types.js';

/**
 * `value` as a JSON literal, with the two line separators JSON leaves raw
 * escaped too: the literal never breaks a line.
 */
export function jsonLiteral(value: JsonValue): string {
  return JSON.stringify(value)
    .split('\u2028')
    .join('\\u2028')
    .split('\u2029')
    .join('\\u2029');
}

/** An argument's value as a step writes it. */
function valueText(value: ArgumentValue): string {
  switch (value.from) {
    case 'user':
      return jsonLiteral(value.value);
    case 'step':
      return `from step ${value.step}`;
    case 'model':
      return value.writes;
    case 'entries':
      return `${value.writes} from step ${value.step}, each as { ${value.fields
        .map(([sent, read]) => `${sent}: the entry's ${read}`)
        .join(', ')} }`;
  }
}

/** `a`, `a and b`, `a, b and c`. */
function joined(words: readonly string[]): string {
  const last = words.at(-1);
  if (last === undefined) return '';
  return words.length === 1
    ? last
    : `${words.slice(0, -1).join(', ')} and ${last}`;
}

/** One step's line, numbered `n`. */
function stepLine(step: PromptStep, n: number): string {
  const before = [step.lead, step.condition].filter(
    (words) => words !== undefined,
  );
  const call = `${step.tool} with ${step.arguments
    .map(([name, value]) => `${name}: ${valueText(value)}`)
    .join(', ')}`;
  const opened =
    before.length === 0 ? `Call ${call}` : `${before.join(', ')}: call ${call}`;
  const repeat = step.repeat === undefined ? '' : `, until ${step.repeat}`;
  const keeps =
    step.keeps === undefined || step.keeps.length === 0
      ? ''
      : `; keep ${joined(step.keeps.map((kept) => `the ${kept}`))} it answers`;
  const after =
    step.finally === undefined
      ? ''
      : ` — after step ${step.finally}, whatever it answered`;
  const note = step.note === undefined ? '' : ` ${step.note}`;
  return `${n}. ${opened}${repeat}${keeps}${after}.${note}`;
}

/** The still-to-fill line of a step, or none. */
function stillToFillLine(
  step: PromptStep,
  n: number,
  steps: number,
): string | undefined {
  if (step.stillToFill.length === 0) return undefined;
  const where = steps === 1 ? 'the call' : `step ${n}`;
  return `Still to fill before ${where}: ${step.stillToFill
    .map(({ name, description }) =>
      description === undefined ? name : `${name} (${description})`,
    )
    .join(', ')}.`;
}

/** The text of `instruction`: headline, steps, still-to-fill lines, notes. */
export function renderInstruction(instruction: PromptInstruction): string {
  const { steps } = instruction;
  return [
    instruction.headline,
    ...steps.map((step, i) => stepLine(step, i + 1)),
    ...steps.flatMap((step, i) => {
      const line = stillToFillLine(step, i + 1, steps.length);
      return line === undefined ? [] : [line];
    }),
    ...instruction.notes,
  ].join('\n');
}
