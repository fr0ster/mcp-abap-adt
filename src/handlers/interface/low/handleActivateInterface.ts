import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateInterface Handler - Activate ABAP Interface
 *
 * Uses AdtClient.getInterface().activate from @mcp-abap-adt/adt-clients 19.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'ActivateInterfaceLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP interface. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    interface_name: z.string().describe('Interface name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface ActivateInterfaceArgs {
  interface_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateInterface(
  context: HandlerContext,
  args: ActivateInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name } = args;

  if (!interface_name) {
    return return_error(new Error('interface_name is required'));
  }

  const interfaceName = interface_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateInterfaceLow', detail },
    () =>
      withAdtHeaders(context, 'interface.activate', (headers) =>
        createAdtClient(connection, logger)
          .getInterface(resultsFor(interfaceDocuments))
          .activate({ interfaceName }, { headers, analyse: analyseActivation }),
      ),
    projectActivation(detail),
  );
}
