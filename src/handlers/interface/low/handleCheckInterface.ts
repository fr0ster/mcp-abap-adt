/**
 * CheckInterface Handler - Syntax check for ABAP Interface
 *
 * Uses AdtClient.getInterface().check from @mcp-abap-adt/adt-clients 19.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckInterfaceLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['interface_name'],
  },
} as const;

interface CheckInterfaceArgs {
  interface_name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckInterface(
  context: HandlerContext,
  args: CheckInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name } = args;

  if (!interface_name) {
    return return_error(new Error('interface_name is required'));
  }

  const interfaceName = interface_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckInterfaceLow', detail },
    () =>
      withAdtHeaders(context, 'interface.check', (headers) =>
        createAdtClient(connection, logger)
          .getInterface(resultsFor(interfaceDocuments))
          .check(
            { interfaceName },
            args.version === 'inactive' ? 'inactive' : 'active',
            {
              headers,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseCheck),
  );
}
