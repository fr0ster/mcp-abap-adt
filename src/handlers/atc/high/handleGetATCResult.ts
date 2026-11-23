import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import {
  type AnswerTable,
  answerAt,
  completeAnswer,
  Written,
} from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import {
  FINDING_IDENTITY,
  findingIdentity,
  findingLines,
} from '../../../lib/strategies/atcFindings';
import { parseAtcResult } from '../../../lib/strategies/atcResults';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourAtc } from '../../../lib/strategies/resultSets';

/**
 * One ATC result by its Display ID, its findings as `GetATCFindings` reads a
 * worklist's: below `objects` the result has the worklist's shape (measured),
 * and both readings share `readAtcObjects`. The result's own `aggregates`
 * read zero while it holds findings (measured), so the counts are the
 * findings'.
 */
export const TOOL_DEFINITION = {
  name: 'GetATCResult',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] Reads the stored ATC result named by display_id. Answers the result's title, check_variant and created_at, how many objects it covered, the counts per priority and each finding with the object, the source position (location and line), the priority, which check ran and what it said. With detail=full each finding also carries the column, check_id, check_class, message_id, documentation_uri (the finding's ATC documentation), exemption_approval and exemption_kind as the result gives them, and quickfixes (the manual, automatic, pseudo, ai_based and ai_enabled flags of the finding's quick fixes).",
  ),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    display_id: requiredText(
      'display_id is required. ListATCResults answers one per result.',
    ).describe('Display ID of a stored ATC result.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetATCResultArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetATCResult(
  context: HandlerContext,
  args: GetATCResultArgs,
) {
  const { connection, logger } = context;
  const displayId = args.display_id.trim();

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);
  const detail = detailOf(args);

  return answer(
    { tool: 'GetATCResult', detail },
    () => atc.getResult(displayId, { analyse: analyseException }),
    (document) =>
      answerAt(RESULT_ANSWERS, levelOf(args))(String(document ?? '')),
  );
}

/** The result's header: what it is and what it counted. */
function resultHead(reading: ReturnType<typeof parseAtcResult>) {
  return {
    success: true,
    display_id: reading.display_id,
    title: reading.title,
    check_variant: reading.check_variant,
    created_at: reading.created_at,
    objects_checked: reading.objects_checked,
    finding_count: reading.findings.length,
    by_priority: reading.by_priority,
  };
}

/**
 * What the stored result answers at each `detail`, selected through a table
 * (`src/lib/detail`): terse the findings to act on (every finding, or
 * nothing: `completeAnswer`), medium and full the whole parse, raw the
 * result document as SAP sent it, nothing of ours around it.
 */
const RESULT_ANSWERS: AnswerTable<string, string | object> = (() => {
  const whole = (document: string) => {
    const reading = parseAtcResult(document);
    return { ...resultHead(reading), findings: reading.findings };
  };
  return {
    // A row per finding (TSV), every one, or nothing (`completeAnswer`).
    terse: completeAnswer(
      'GetATCResult',
      (document: string) =>
        parseAtcResult(document).findings.map(findingIdentity),
      (document: string) => {
        const reading = parseAtcResult(document);
        return Written.text(
          findingLines(
            [
              { head: 'result', value: reading.display_id },
              ...(reading.title
                ? [{ head: 'title', value: reading.title }]
                : []),
              ...(reading.check_variant
                ? [{ head: 'check_variant', value: reading.check_variant }]
                : []),
              ...(reading.created_at
                ? [{ head: 'created_at', value: reading.created_at }]
                : []),
              {
                head: 'objects_checked',
                value: String(reading.objects_checked),
              },
              {
                head: 'finding_count',
                value: String(reading.findings.length),
              },
            ],
            reading.by_priority,
            reading.findings,
          ),
          FINDING_IDENTITY,
        );
      },
    ),
    medium: whole,
    full: whole,
    raw: (document: string) => document,
  };
})();
