import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_FIELD, withLongToolAdvice } from '../../../lib/longTools';
import { parseAtcResultList } from '../../../lib/strategies/atcResults';
import { ourAtc } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/**
 * The ATC results the system holds, newest first as SAP sends them.
 *
 * `created_by` is required: SAP refuses a list without it (`400`, measured),
 * and `*` names every user. With no ages SAP applies a window of its own,
 * which moved between two days (measured), so a list to rely on states them.
 * SAP takes no count; the ages bound the list.
 */
export const TOOL_DEFINITION = {
  name: 'ListATCResults',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Lists the ATC results the system holds, newest first. Answers each result with its display_id, title, check_variant, run_series, created_at, the finding counts per priority and the failure count. created_by names whose results (a user name, or * for every user); central_only=true lists central results only; age_min and age_max bound the age in days, and when both are absent the system applies an age window of its own.',
  ),
  inputSchema: z.object({
    timeout: TIMEOUT_FIELD,
    created_by: z
      .string()
      .describe('Whose results: a user name, or * for every user.'),
    central_only: z
      .boolean()
      .optional()
      .describe('true lists central results only; absent lists every kind.'),
    age_min: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Youngest age to list, in days.'),
    age_max: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Oldest age to list, in days.'),
  }),
} as const;

interface ListATCResultsArgs {
  created_by?: string;
  central_only?: boolean;
  age_min?: number;
  age_max?: number;
}

/** A day count the model gave: a whole number from 0 up, else the words. */
function ageError(name: string, value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value >= 0
    ? undefined
    : `${name} is a whole number of days from 0 up.`;
}

export async function handleListATCResults(
  context: HandlerContext,
  args: ListATCResultsArgs,
) {
  const { connection, logger } = context;
  const createdBy = args?.created_by?.trim();
  if (!createdBy) {
    return return_error(
      new Error('created_by is required: a user name, or * for every user.'),
    );
  }
  const refused =
    ageError('age_min', args.age_min) ?? ageError('age_max', args.age_max);
  if (refused !== undefined) return return_error(new Error(refused));

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
    (document) => {
      const { results } = parseAtcResultList(String(document ?? ''));
      return { success: true, result_count: results.length, results };
    },
  );
}
