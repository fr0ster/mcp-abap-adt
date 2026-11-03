import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_FIELD, withLongToolAdvice } from '../../../lib/longTools';
import { terseFinding } from '../../../lib/strategies/atcFindings';
import { parseAtcResult } from '../../../lib/strategies/atcResults';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { ourAtc } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

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
    timeout: TIMEOUT_FIELD,
    display_id: z.string().describe('Display ID of a stored ATC result.'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface GetATCResultArgs {
  display_id?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetATCResult(
  context: HandlerContext,
  args: GetATCResultArgs,
) {
  const { connection, logger } = context;
  const displayId = args?.display_id?.trim();
  if (!displayId) {
    return return_error(
      new Error(
        'display_id is required. ListATCResults answers one per result.',
      ),
    );
  }

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);
  const detail = detailOf(args);

  return answer(
    { tool: 'GetATCResult', detail },
    () => atc.getResult(displayId, { analyse: analyseException }),
    (document) => {
      if (detail === 'raw') {
        return { success: true, display_id: displayId, result: document };
      }
      const reading = parseAtcResult(String(document ?? ''));
      return {
        success: true,
        display_id: reading.display_id,
        title: reading.title,
        check_variant: reading.check_variant,
        created_at: reading.created_at,
        objects_checked: reading.objects_checked,
        finding_count: reading.findings.length,
        by_priority: reading.by_priority,
        findings:
          detail === 'full'
            ? reading.findings
            : reading.findings.map(terseFinding),
      };
    },
  );
}
