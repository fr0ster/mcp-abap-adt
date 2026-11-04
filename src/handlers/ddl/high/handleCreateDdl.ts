import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateDdl Handler - CDS/Classic View Creation via ADT API
 *
 * Uses AdtClient.getDdl().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 *
 * **No source here.** `createDdl` never reads `ddl_source`: a create posts
 * metadata, and the source is a PUT to `.../source/main` under a lock, which
 * is `UpdateDdl`'s job. The pre-migration handler's own `validate()` call is
 * dropped — this is a bare create, matching `CreateDdlLow`. Verified against
 * `AdtDdl.js`.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateDdl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Creates the CDS view or classic DDL view named by ddl_name in the package named by package_name, in initial state: the DDL source object, its DDL source code written afterwards.',
  inputSchema: createArguments('CreateDdl', {
    ddl_name: z.string().describe('DDL source name.'),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number (required for transportable packages), not a task.',
      ),
    description: z
      .string()
      .optional()
      .describe('Optional description (defaults to ddl_name).'),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

interface CreateDdlArgs {
  ddl_name: string;
  package_name: string;
  transport_request?: string;
  description?: string;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateDdl(
  context: HandlerContext,
  args: CreateDdlArgs,
) {
  const { connection, logger } = context;

  if (!args.ddl_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: ddl_name and package_name'),
    );
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const ddlName = args.ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateDdl', detail },
    () =>
      withAdtHeaders(context, 'ddl.create', (headers) =>
        createAdtClient(connection, logger)
          .getDdl(resultsFor(ddlDocuments))
          .create(
            {
              ddlName,
              description: args.description || ddlName,
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
