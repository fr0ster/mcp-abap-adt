import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateIncludeLow Handler - Activate an ABAP Include
 *
 * As `ActivateProgramLow`: one stateless activation POST. The client is the
 * on-premise one, so a connection declared otherwise is refused
 * `variant_not_served` before anything is sent. Registered as
 * `ActivateInclude`.
 */

import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { projectActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateIncludeLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Activate an ABAP include. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    include_name: z.string().describe('Include name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
type ActivateIncludeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleActivateInclude(
  context: HandlerContext,
  args: ActivateIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }

  const includeName = args.include_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateIncludeLow', detail },
    () =>
      withAdtHeaders(context, 'include.activate', (headers) =>
        createOnPremAdtClient(connection, logger)
          .getInclude(resultsFor(includeDocuments))
          .activate({ includeName }, { headers, analyse: analyseActivation }),
      ),
    projectActivation(detail),
  );
}
