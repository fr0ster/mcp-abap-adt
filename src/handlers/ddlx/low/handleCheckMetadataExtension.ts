/**
 * CheckMetadataExtensionLow Handler - Syntax check for ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().check from @mcp-abap-adt/adt-clients 19.
 *
 * **The version has to be asked for, because this endpoint does not guess.**
 * The DDLX checkruns endpoint does not fall back to the version that exists,
 * unlike the DDLS one. Measured on trial, 2026-09-20, on one object in each
 * state (both documents are in the corpus):
 *
 * | the extension | `active` | `inactive` (the shipped default) |
 * |---|---|---|
 * | activated | `processed` | `notProcessed`, "Error while reading the object … from the database" |
 * | never activated | `notProcessed` | `processed` |
 *
 * So the shipped default answered nothing useful for every activated
 * extension — which is most of them, and the case eseuve reported in #178.
 * `version` now names it, and defaults to `active`: a check tool is asked
 * about an object that exists, and the caller who has just written one and
 * wants the unsaved version says so.
 *
 * A `notProcessed` is not a refusal and never was — `analyseException` reads
 * an `exc:exception` or a non-2xx, and this is a 200 with a report inside. It
 * arrives as `ran: false` with the status text beside it, which is the honest
 * answer to "the check did not run", and is why this cost a caller an answer
 * rather than a false failure.
 *
 * `checkMetadataExtension` takes no source parameter at all — unlike
 * ddl/structure, there is no unsaved-code check here to forward.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., ZI_MY_DDLX).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        default: 'active',
        description:
          "Which version to check: 'active' (default) or 'inactive', the unsaved one right after a write. This endpoint does not fall back — asking for a version the extension does not have answers status notProcessed, 'Error while reading the object … from the database', rather than checking the other one.",
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
    required: ['name'],
  },
} as const;

interface CheckMetadataExtensionArgs {
  name: string;
  version?: 'active' | 'inactive';
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckMetadataExtension(
  context: HandlerContext,
  args: CheckMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name, version, session_id, session_state } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);
  const checkVersion: 'active' | 'inactive' =
    version === 'inactive' ? 'inactive' : 'active';

  return answer(
    { tool: 'CheckMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .check({ name: ddlxName }, checkVersion, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
