/**
 * ActivateServiceBinding Handler - Activate ABAP Service Binding
 *
 * Uses AdtClient.getServiceBinding().activate from @mcp-abap-adt/adt-clients 19.
 *
 * `getServiceBinding()` is `AdtServiceBinding`, declared over `serviceDocuments`
 * (the same result-set shape `AdtService` — the OData-publication subclass —
 * shares), and its `activate(config, options)` reads `config.bindingName`.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'ActivateServiceBindingLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP service binding. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Service binding name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface ActivateServiceBindingArgs {
  name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateServiceBinding(
  context: HandlerContext,
  args: ActivateServiceBindingArgs,
) {
  const { connection, logger } = context;
  const { name } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const bindingName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateServiceBindingLow', detail },
    () =>
      withAdtHeaders(context, 'serviceBinding.activate', (headers) =>
        createAdtClient(connection, logger)
          .getServiceBinding(resultsFor(serviceDocuments))
          .activate({ bindingName }, { headers, analyse: analyseActivation }),
      ),
    project(detail, terseActivation),
  );
}
