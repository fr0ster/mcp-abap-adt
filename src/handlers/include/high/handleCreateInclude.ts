import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateInclude Handler - ABAP include creation via ADT
 *
 * One request, the create alone, as `CreateProgram`: `POST` to the includes
 * collection with an `include:abapInclude` document. The include is created
 * inactive, and SAP writes a comment header into it (measured on premise,
 * 2026-11-01); its source is written by a later call. The client is
 * the on-premise one, so a connection declared otherwise is refused
 * `variant_not_served` before anything is sent.
 */

import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateInclude',
  available_in: ['onprem'] as const,
  description:
    'Creates the ABAP include named by include_name in the package named by package_name. The include is created inactive, holding the comment header SAP writes into a new include; its source is written afterwards.',
  inputSchema: z.object({
    include_name: z.string().describe('Include name.'),
    package_name: z.string().describe('Package name.'),
    description: z
      .string()
      .optional()
      .describe('Include description. If not provided, include_name is used.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    master_language: z
      .string()
      .optional()
      .describe(
        'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface CreateIncludeArgs {
  include_name?: string;
  package_name?: string;
  description?: string;
  transport_request?: string;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateInclude(
  context: HandlerContext,
  args: CreateIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }
  if (!args.package_name) {
    return return_error(new Error('package_name is required'));
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const includeName = args.include_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateInclude', detail },
    () =>
      withAdtHeaders(context, 'include.create', (headers) =>
        createOnPremAdtClient(connection, logger)
          .getInclude(resultsFor(includeDocuments))
          .create(
            {
              includeName,
              description: args.description || includeName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              masterLanguage: args.master_language,
            },
            { headers, analyse: analyseException },
          ),
      ),
    project(detail, terseWrite),
  );
}
