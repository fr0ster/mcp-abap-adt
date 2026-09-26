import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourAtc } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/**
 * Whether a run that did not wait has ended.
 *
 * **Completion, not success** — the client is explicit that `finished` says
 * the run reached an end, not that the end was a good one, and that it ships
 * no `isFailed` or `isTerminal` because no failed or cancelled run has ever
 * been observed. Naming states nothing sends is how a caller ends up matching
 * against fiction, so this answers the server's own word for the state and the
 * one derived flag the client does draw.
 *
 * The client's note says only `finished` had ever been observed; a run
 * started here on 2026-09-20 answered `running` while it worked, so the
 * server does send more than one word. Which is the reason this passes the
 * word through instead of branching on it.
 *
 * **No `detail`.** There is no document here: the client parses the run
 * resource into four fields and answers those, so terse, full and raw would be
 * the same four.
 */
export const TOOL_DEFINITION = {
  name: 'GetATCRunStatus',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Ask whether an ATC run has ended. Takes the run_id from RunATC (only a run started with wait=false has one). Answers the status the server reports and whether it is finished — finished means ended, not that the checks passed. Read what it found with GetATCFindings, by worklist_id.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier answered by RunATC when wait was false.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface GetATCRunStatusArgs {
  run_id?: string;
}

export async function handleGetATCRunStatus(
  context: HandlerContext,
  args: GetATCRunStatusArgs,
) {
  const { connection, logger } = context;
  const runId = args?.run_id?.trim();
  if (!runId) {
    return return_error(
      new Error(
        'run_id is required. RunATC answers one when wait is false; a run that waited has no run to poll.',
      ),
    );
  }

  const atc = new AdtRuntimeClient(connection, logger).getAtc(ourAtc);

  return answer(
    { tool: 'GetATCRunStatus', detail: 'terse' },
    () => atc.getRunStatus(runId, { analyse: analyseException }),
    (status) => ({
      success: true,
      run_id: runId,
      status: status.status,
      is_finished: status.isFinished,
      // Both are absent on some answers, and an id invented where the server
      // sent none would send the next call somewhere that does not exist.
      ...(status.worklistId ? { worklist_id: status.worklistId } : {}),
      ...(status.resultId ? { result_id: status.resultId } : {}),
    }),
  );
}
