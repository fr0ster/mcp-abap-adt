/**
 * CreateDdlLow Handler - Create ABAP DDL Source
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
 * is `UpdateDdlLow`'s job. Verified against `AdtDdl.js`.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP DDL source. - use CreateDdl (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description:
          'DDL source name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'DDL source description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      application: {
        type: 'string',
        description: "Application area (optional, default: '*').",
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['ddl_name', 'description', 'package_name'],
  },
} as const;

interface CreateDdlArgs {
  ddl_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateDdl(
  context: HandlerContext,
  args: CreateDdlArgs,
) {
  const { connection, logger } = context;
  const {
    ddl_name,
    description,
    package_name,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (!ddl_name || !description || !package_name) {
    return return_error(
      new Error('ddl_name, description, and package_name are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateDdlLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDdl(resultsFor(ddlDocuments))
        .create(
          {
            ddlName,
            description,
            packageName: package_name,
            transportRequest: transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
