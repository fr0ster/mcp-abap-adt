import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import { parseAtcResultList } from '../../../lib/strategies/atcResults';
import { ourAtc } from '../../../lib/strategies/resultSets';

/**
 * The ATC results the system holds, newest first as SAP sends them.
 *
 * `created_by` is required: SAP refuses a list without it (`400`, measured),
 * and `*` names every user. With no ages SAP applies a window of its own,
 * which moved between two days (measured), so a list to rely on states them.
 * SAP takes no count; the ages bound the list.
 */
/** The refusal of a day count that is not a whole number from 0 up. */
const AGE_MIN_WORDS = 'age_min is a whole number of days from 0 up.';
const AGE_MAX_WORDS = 'age_max is a whole number of days from 0 up.';

export const TOOL_DEFINITION = {
  name: 'ListATCResults',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Lists the ATC results the system holds for a user or for every user, newest first, within an age range in days.',
      ),
      notes: [longRunning],
    }),
  ),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    created_by: requiredText(
      'created_by is required: a user name, or * for every user.',
    ).describe('Whose results: a user name, or * for every user.'),
    central_only: z
      .boolean()
      .optional()
      .describe('true lists central results only; absent lists every kind.'),
    age_min: z
      .number({ error: AGE_MIN_WORDS })
      .int({ error: AGE_MIN_WORDS })
      .min(0, { error: AGE_MIN_WORDS })
      .optional()
      .describe('Youngest age to list, in days.'),
    age_max: z
      .number({ error: AGE_MAX_WORDS })
      .int({ error: AGE_MAX_WORDS })
      .min(0, { error: AGE_MAX_WORDS })
      .optional()
      .describe('Oldest age to list, in days.'),
  }),
} as const;

type ListATCResultsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleListATCResults(
  context: HandlerContext,
  args: ListATCResultsArgs,
) {
  const { connection, logger } = context;
  // The schema holds the rules: created_by not blank, the ages whole days.
  const createdBy = args.created_by.trim();

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);

  return answer(
    { tool: 'ListATCResults', detail: 'terse' },
    () =>
      atc.listResults({
        createdBy,
        ...(args.central_only === true && { centralOnly: true }),
        ...(args.age_min !== undefined && { ageMin: args.age_min }),
        ...(args.age_max !== undefined && { ageMax: args.age_max }),
        analyse: analyseException,
      }),
    (document) => atcResultListAnswer(String(document ?? '')),
  );
}

/** What the list answers: how many results, and each result. */
export function atcResultListAnswer(document: string) {
  const { results } = parseAtcResultList(document);
  return { success: true, result_count: results.length, results };
}
