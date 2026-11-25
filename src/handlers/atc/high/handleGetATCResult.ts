import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import {
  longRunning,
  purpose,
  toolDescription,
} from '../../../lib/description';
import {
  headShape,
  type ListAnswerTable,
  listAnswerAt,
  writeWhole,
} from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import {
  findingsText,
  PRIORITY_HEAD,
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
/** The heads the findings listing opens with. */
export const ATC_RESULT_HEADS = [
  headShape('result', 'the result ID'),
  headShape('title', 'its title'),
  headShape('check_variant', 'its check variant'),
  headShape('created_at', 'when it was created'),
  headShape('objects_checked', 'how many objects it covered'),
  headShape('finding_count', 'how many findings there are'),
  PRIORITY_HEAD,
];

export const TOOL_DEFINITION = {
  name: 'GetATCResult',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads a stored ATC result by its display ID: its findings and the counts per priority.',
    ),
    notes: [longRunning],
  }),
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
      listAnswerAt(RESULT_ANSWERS, levelOf(args))(String(document ?? '')),
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
 * a row per finding, written by the listing writer), medium and full the whole parse, raw the
 * result document as SAP sent it, nothing of ours around it.
 */
const RESULT_ANSWERS: ListAnswerTable<string, string | object> = (() => {
  const whole = (document: string) => {
    const reading = parseAtcResult(document);
    return { ...resultHead(reading), findings: reading.findings };
  };
  return {
    // A row per finding (TSV), every one, written by the listing writer.
    terse: (document: string) => {
      const reading = parseAtcResult(document);
      return findingsText(
        [
          { head: 'result', value: reading.display_id },
          ...(reading.title ? [{ head: 'title', value: reading.title }] : []),
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
      );
    },
    // The reading whole, as full gives it: complete by construction.
    medium: (document: string) => writeWhole(whole(document)),
    full: whole,
    raw: (document: string) => document,
  };
})();
