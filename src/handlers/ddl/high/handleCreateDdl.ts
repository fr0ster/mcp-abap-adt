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
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Create. Subject: DDL source. Will be useful for creating a DDL source. Create a new CDS View or Classic View in SAP system. Creates the DDL source object in initial state. Use UpdateDdl to set DDL source code.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      description: {
        type: 'string',
        description: 'Optional description (defaults to ddl_name).',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['ddl_name', 'package_name'],
  },
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
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
