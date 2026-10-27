import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import {
  parseAtcWorklist,
  terseFinding,
} from '../../../lib/strategies/atcFindings';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourAtc } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

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
export const TOOL_DEFINITION = {
  name: 'GetATCFindings',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] Reads the findings of the ATC run whose worklist is named by worklist_id, for a run started with wait=true or wait=false. Answers each finding with the object, the source position (location and line), the priority, which check ran and what it said, plus how many objects were covered and the counts per priority. With detail=full each finding also carries the column, check_id, check_class, message_id, documentation_uri (the finding's ATC documentation), exemption_approval and exemption_kind as the worklist gives them, and quickfixes (the manual, automatic, pseudo, ai_based and ai_enabled flags of the finding's quick fixes).",
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      worklist_id: {
        type: 'string',
        description: 'Worklist identifier an ATC run answered.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['worklist_id'],
  },
} as const;

interface GetATCFindingsArgs {
  worklist_id?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetATCFindings(
  context: HandlerContext,
  args: GetATCFindingsArgs,
) {
  const { connection, logger } = context;
  const worklistId = args?.worklist_id?.trim();
  if (!worklistId) {
    return return_error(
      new Error('worklist_id is required. RunATC answers one on every run.'),
    );
  }

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);
  const detail = detailOf(args);

  return answer(
    { tool: 'GetATCFindings', detail },
    () => atc.getFindings(worklistId, { analyse: analyseException }),
    (document) => {
      // `raw` is the document, which is the whole point of having the level:
      // a caller needing an attribute neither reading keeps (the finding's
      // own uri, its checksum, its processor) has it there.
      if (detail === 'raw') {
        return { success: true, worklist_id: worklistId, worklist: document };
      }
      const reading = parseAtcWorklist(String(document ?? ''));
      return {
        success: true,
        worklist_id: worklistId,
        objects_checked: reading.objects_checked,
        finding_count: reading.findings.length,
        by_priority: reading.by_priority,
        // `full` is the whole parse; `terse` the fields to act on.
        findings:
          detail === 'full'
            ? reading.findings
            : reading.findings.map(terseFinding),
        // **Zero objects is not zero findings.** A run writes into the
        // worklist as it goes, so reading one whose run is still going
        // answers a worklist with nothing in it — measured against trial on
        // 2026-09-20, where a read taken right after `wait: false` answered
        // no objects at all while `GetATCRunStatus` still said `running`.
        // Left as counts alone that reads exactly like a clean check, which
        // is the one outcome the client's own notes call dangerous. So when
        // the worklist holds nothing, the answer says what that means.
        ...(reading.objects_checked === 0
          ? {
              note: 'This worklist holds no objects yet. A run fills it as it completes, so this is not a clean result — ask GetATCRunStatus whether the run has finished, then read again.',
            }
          : {}),
      };
    },
  );
}
