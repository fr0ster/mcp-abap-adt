/**
 * The update prompt: read the object, then write its new content — one
 * call on the full set; on compact under the family's lock, unlocked after
 * the write whatever it answered.
 */
import * as z from 'zod';
import { jsonLiteral } from './instruction.js';
import {
  compactNamed,
  familyRows,
  headline,
  lockToolsFor,
  objectPrompt,
  optionalArguments,
  type PromptArguments,
  readStep,
  type ServedRow,
  type StepArguments,
  servedRows,
  TRANSPORT_REQUEST_WORDS,
  takesLine,
  underLock,
} from './objectPrompts.js';
import {
  COMPACT_ROWS,
  FULL_ROWS,
  READ_PART,
  readTypeOf,
} from './objectRows.js';
import { requiredArgument } from './served.js';
import { toolStep } from './source.js';
import type { AbapPrompt, PromptSource, PromptStep } from './types.js';

const CHANGE_WORDS =
  'What to change, in words; the model writes the new content.';

/** The new content's argument, written by the model: a metadata document for a type with no source. */
function contentArgument(row: ServedRow): StepArguments {
  if (row.content === undefined) return [];
  return [
    [
      row.content,
      {
        from: 'model',
        writes:
          READ_PART(row.type) === 'metadata'
            ? 'the whole new metadata document'
            : 'the whole new source',
      },
    ],
  ];
}

/** The change line, when `change` is given. */
function changeNotes(args: PromptArguments): readonly string[] {
  const change = requiredArgument(args, 'change');
  return change === undefined ? [] : [`The change: ${jsonLiteral(change)}`];
}

/** `update`: read the object, then write it. */
export function updatePrompt(source: PromptSource): AbapPrompt | undefined {
  // A write reads with its own family's read: a full read listed beside
  // the compact tools serves no compact write.
  const reads = {
    full: familyRows(source, FULL_ROWS.get, COMPACT_ROWS.get, 'full'),
    compact: familyRows(source, FULL_ROWS.get, COMPACT_ROWS.get, 'compact'),
  };
  const readOf = (row: ServedRow): ServedRow | undefined => {
    const readType = readTypeOf(row.type);
    return reads[row.family].find((read) => read.type === readType);
  };
  const rows = servedRows(source, FULL_ROWS.update, COMPACT_ROWS.update).filter(
    (row) =>
      readOf(row) !== undefined &&
      (row.family === 'full' || lockToolsFor(source, row.type) !== undefined),
  );
  return objectPrompt(
    'update',
    'Changes an ABAP object of object_type named name as change says: reads the object, then writes its new content.',
    rows,
    {
      change: z.string().optional().describe(CHANGE_WORDS),
      transport_request: z
        .string()
        .optional()
        .describe(TRANSPORT_REQUEST_WORDS),
    },
    (row, named, args) => {
      const read = readOf(row);
      const locks = lockToolsFor(source, row.type);
      const write = (handle: StepArguments, state: StepArguments): PromptStep =>
        toolStep(
          row.tool,
          [
            ...compactNamed(row, named),
            ...handle,
            ...contentArgument(row),
            ...optionalArguments(row.tool, args, ['transport_request']),
            ...state,
          ],
          { lead: 'Write it' },
        );
      const readSteps =
        read === undefined ? [] : [readStep(read, named, { lead: 'Read it' })];
      const steps =
        row.family === 'compact' && locks !== undefined
          ? [
              ...readSteps,
              ...underLock(source, locks, row.type, named, write, 2),
            ]
          : [...readSteps, write([], [])];
      return {
        headline: headline('Update', row.type, named.name),
        steps,
        notes: [
          ...(row.family === 'compact' ? [takesLine(row.type, row.token)] : []),
          ...changeNotes(args),
        ],
      };
    },
  );
}
