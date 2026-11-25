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
  parseAtcWorklist,
} from '../../../lib/strategies/atcFindings';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourAtc } from '../../../lib/strategies/resultSets';

/**
 * What an ATC run found, by worklist.
 *
 * The worklist outlives the run and does not care whether it waited, so this
 * is the one call that answers findings in either mode. `getFindings()` hands
 * back the document as ADT sent it — 18 KB for one package, most of it the
 * objects checked and the column labels of a UI nobody here has — so the
 * reading is ours: see `atcFindings.ts`, written against the captured
 * document rather than an imagined one.
 */
/** The heads the findings listing opens with. */
export const ATC_FINDINGS_HEADS = [
  headShape('worklist', 'the worklist ID'),
  headShape('objects_checked', 'how many objects the run covered'),
  headShape('finding_count', 'how many findings there are'),
  headShape(
    'note',
    'what an empty worklist means, while the run is still filling it',
  ),
  PRIORITY_HEAD,
];

export const TOOL_DEFINITION = {
  name: 'GetATCFindings',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background.',
    ),
    notes: [longRunning],
  }),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    worklist_id: requiredText(
      'worklist_id is required. RunATC answers one on every run.',
    ).describe('Worklist identifier an ATC run answered.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetATCFindingsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetATCFindings(
  context: HandlerContext,
  args: GetATCFindingsArgs,
) {
  const { connection, logger } = context;
  const worklistId = args.worklist_id.trim();

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);
  const detail = detailOf(args);

  return answer(
    { tool: 'GetATCFindings', detail },
    () => atc.getFindings(worklistId, { analyse: analyseException }),
    (document) =>
      listAnswerAt(
        findingsAnswers(worklistId),
        levelOf(args),
      )(String(document ?? '')),
  );
}

/**
 * What the worklist answers at each `detail`, selected through a table
 * (`src/lib/detail`): terse the findings to act on (every finding, or
 * a row per finding, written by the listing writer), medium and full the whole parse, raw the
 * document — which is the whole point of having the level: a caller
 * needing an attribute neither reading keeps (the finding's own uri, its
 * checksum, its processor) has it there.
 */
function findingsAnswers(
  worklistId: string,
): ListAnswerTable<string, string | object> {
  const head = (reading: ReturnType<typeof parseAtcWorklist>) => ({
    success: true,
    worklist_id: worklistId,
    objects_checked: reading.objects_checked,
    finding_count: reading.findings.length,
    by_priority: reading.by_priority,
  });
  // **Zero objects is not zero findings.** A run writes into the worklist as
  // it goes, so reading one whose run is still going answers a worklist with
  // nothing in it — measured against trial on 2026-09-20, where a read taken
  // right after `wait: false` answered no objects at all while
  // `GetATCRunStatus` still said `running`. Left as counts alone that reads
  // exactly like a clean check, which is the one outcome the client's own
  // notes call dangerous. So when the worklist holds nothing, the answer
  // says what that means.
  const noteOf = (reading: ReturnType<typeof parseAtcWorklist>) =>
    reading.objects_checked === 0
      ? {
          note: 'This worklist holds no objects yet. A run fills it as it completes, so this is not a clean result — ask GetATCRunStatus whether the run has finished, then read again.',
        }
      : {};
  const whole = (document: string) => {
    const reading = parseAtcWorklist(document);
    return { ...head(reading), findings: reading.findings, ...noteOf(reading) };
  };
  return {
    // A row per finding (TSV), every one, written by the listing writer.
    terse: (document: string) => {
      const reading = parseAtcWorklist(document);
      const note = noteOf(reading).note;
      return findingsText(
        [
          { head: 'worklist', value: worklistId },
          {
            head: 'objects_checked',
            value: String(reading.objects_checked),
          },
          {
            head: 'finding_count',
            value: String(reading.findings.length),
          },
          ...(note === undefined ? [] : [{ head: 'note', value: note }]),
        ],
        reading.by_priority,
        reading.findings,
      );
    },
    // The reading whole, as full gives it: complete by construction.
    medium: (document: string) => writeWhole(whole(document)),
    full: whole,
    raw: (document) => document,
  };
}
