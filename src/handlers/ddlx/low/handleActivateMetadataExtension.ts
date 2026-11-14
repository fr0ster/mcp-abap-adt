import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateMetadataExtensionLow Handler - Activate ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().activate from @mcp-abap-adt/adt-clients 19.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { projectActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    name: z.string().describe('Metadata Extension name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type ActivateMetadataExtensionArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleActivateMetadataExtension(
  context: HandlerContext,
  args: ActivateMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateMetadataExtensionLow', detail },
    () =>
      withAdtHeaders(context, 'metadataExtension.activate', (headers) =>
        createAdtClient(connection, logger)
          .getMetadataExtension(resultsFor(metadataExtensionDocuments))
          .activate(
            { name: ddlxName },
            { headers, analyse: analyseActivation },
          ),
      ),
    projectActivation(detail),
  );
}
