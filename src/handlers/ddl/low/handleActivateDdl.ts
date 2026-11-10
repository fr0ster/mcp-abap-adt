import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateDdlLow Handler - Activate ABAP DDL Source (CDS View)
 *
 * Uses AdtClient.getDdl().activate from @mcp-abap-adt/adt-clients 19.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'ActivateDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP DDL source (CDS view). Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    ddl_name: z.string().describe('DDL source name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface ActivateDdlArgs {
  ddl_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateDdl(
  context: HandlerContext,
  args: ActivateDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name } = args;

  if (!ddl_name) {
    return return_error(new Error('ddl_name is required'));
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateDdlLow', detail },
    () =>
      withAdtHeaders(context, 'ddl.activate', (headers) =>
        createAdtClient(connection, logger)
          .getDdl(resultsFor(ddlDocuments))
          .activate({ ddlName }, { headers, analyse: analyseActivation }),
      ),
    projectActivation(detail),
  );
}
