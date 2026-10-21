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
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP DDL source (CDS view). Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['ddl_name'],
  },
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
    project(detail, terseActivation),
  );
}
