/**
 * UpdateDdlLow Handler - Update ABAP DDL Source
 *
 * Uses AdtClient.getDdl().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.sourceCode`.** Unlike `AdtInterface` or
 * `AdtMetadataExtension`, `AdtDdl.update()`'s shipped body does keep a
 * fallback — `const source = options?.sourceCode || config.ddlSource` — but
 * this handler writes through `options` only, the one channel every sibling
 * family in this cluster shares, and never puts a source string on `config`.
 * Verified against `AdtDdl.js`, not the declaration file.
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
  name: 'UpdateDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockDdlLow. - use UpdateDdl (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description:
          'DDL source name (e.g., ZOK_R_TEST_0002). DDL source must already exist.',
      },
      ddl_source: {
        type: 'string',
        description:
          "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement.",
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockDdlLow. Required for update operation.',
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
    required: ['ddl_name', 'ddl_source', 'lock_handle'],
  },
} as const;

interface UpdateDdlArgs {
  ddl_name: string;
  ddl_source: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateDdl(
  context: HandlerContext,
  args: UpdateDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, ddl_source, lock_handle, session_id, session_state } = args;

  if (!ddl_name || !ddl_source || !lock_handle) {
    return return_error(
      new Error('ddl_name, ddl_source, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateDdlLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDdl(resultsFor(ddlDocuments))
        .update(
          { ddlName },
          {
            sourceCode: ddl_source,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
