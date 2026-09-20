/**
 * CheckTableLow Handler - Syntax check for ABAP Table
 *
 * Uses AdtClient.getTable().check from @mcp-abap-adt/adt-clients 19.
 *
 * **`ddl_code` and `reporter` no longer reach the wire.** The shipped
 * `AdtTable.check()` calls `runTableCheckRun(connection, 'abapCheckRun',
 * name, undefined, version)` — the reporter is hardcoded to `'abapCheckRun'`
 * and the fourth argument (where a source would go) is hardcoded
 * `undefined`, never `config.ddlCode`. Unlike `structure`'s sibling member,
 * there is no unsaved-code check here. Both parameters stay on the tool
 * schema (removing an existing parameter is not this migration's job) but
 * neither is forwarded, since forwarding them would say they do something
 * they do not. Verified against `AdtTable.js`, not the declaration file.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE)',
      },
      ddl_code: {
        type: 'string',
        description:
          'Accepted for compatibility; not sent to the server. The shipped check endpoint takes no source of its own — it checks whatever is already saved.',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' selects the last activated version. 'inactive' and 'new' are accepted for compatibility but indistinguishable — the shipped check endpoint treats anything other than 'active' as 'inactive'. Default: new.",
        enum: ['active', 'inactive', 'new'],
      },
      reporter: {
        type: 'string',
        description:
          "Accepted for compatibility; not sent to the server. The shipped check endpoint always runs 'abapCheckRun', regardless of this value.",
        enum: ['tableStatusCheck', 'abapCheckRun'],
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
    required: ['table_name'],
  },
} as const;

interface CheckTableArgs {
  table_name: string;
  ddl_code?: string;
  version?: string;
  reporter?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckTable(
  context: HandlerContext,
  args: CheckTableArgs,
) {
  const { connection, logger } = context;
  const { table_name, version, session_id, session_state } = args;

  if (!table_name) {
    return return_error(new Error('table_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const tableName = table_name.toUpperCase();
  const validVersions = ['active', 'inactive', 'new'];
  const checkVersion =
    version && validVersions.includes(version.toLowerCase())
      ? version.toLowerCase()
      : 'new';
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckTableLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getTable(resultsFor(tableDocuments))
        .check({ tableName }, checkVersion, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
