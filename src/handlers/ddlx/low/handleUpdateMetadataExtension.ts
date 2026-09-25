/**
 * UpdateMetadataExtensionLow Handler - Update ABAP Metadata Extension Source Code
 *
 * Uses AdtClient.getMetadataExtension().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes in `options`, not `config`.** The pre-migration (v18)
 * handler put `source` inside the config object passed as the first
 * argument — `update({ name, source }, { lockHandle })`. The shipped
 * `AdtMetadataExtension.update()` reads `options?.source` only, and says
 * so in its own comment: "This used to fall back to `config.source` —
 * two channels for one value, where the contract documents one.
 * `config.source` is `check`'s alone now". `IMetadataExtensionConfig`
 * still declares a `source` field, so the old shape still compiled —
 * this is the exact empty-write shape cluster 14 found in four handlers,
 * and it recurs here in the family that removed the fallback outright.
 * Verified against `AdtMetadataExtension.js`, not the declaration file.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP metadata extension. Requires lock handle from LockObject. - use UpdateMetadataExtension (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Metadata extension name (e.g., ZOK_C_TEST_0001). Metadata extension must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete metadata extension source code.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
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
    required: ['name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateMetadataExtensionArgs {
  name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateMetadataExtension(
  context: HandlerContext,
  args: UpdateMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name, source_code, lock_handle, session_id, session_state } = args;

  if (!name || !source_code || !lock_handle) {
    return return_error(
      new Error('name, source_code, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .update(
          { name: ddlxName },
          {
            source: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
