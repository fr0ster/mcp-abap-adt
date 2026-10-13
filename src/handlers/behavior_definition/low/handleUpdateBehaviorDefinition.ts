/**
 * UpdateBehaviorDefinition Handler - Update ABAP Behavior Definition Source Code
 *
 * Uses AdtClient.getBehaviorDefinition().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes in `options`, not `config`.**
 * `IBehaviorDefinitionConfig` still declares a `source` field, so
 * `update({ name, source }, ...)` compiles either way — but the shipped
 * `AdtBehaviorDefinition.update()` reads `options?.source` only (its own
 * comment: "This used to fall back to `config.source` — two channels
 * for one value, where the contract documents one"). `transportRequest`
 * stays in `config` — the same member reads `config.transportRequest`
 * directly. A `.d.ts` comment is not evidence for where a value lands; the
 * compiled JavaScript is. Verified against `AdtBehaviorDefinition.js`, not
 * the declaration file.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateBehaviorDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Behavior definition name. Behavior definition must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete behavior definition source code.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages), not a task.',
      },
      session_id: {
        type: 'string',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
      },
      session_state: {
        type: 'object',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
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

interface UpdateBehaviorDefinitionArgs {
  name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateBehaviorDefinition(
  context: HandlerContext,
  args: UpdateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name, source_code, lock_handle, transport_request } = args;

  if (!name || !source_code || !lock_handle) {
    return return_error(
      new Error('name, source_code, and lock_handle are required'),
    );
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateBehaviorDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        .update(
          {
            name: bdefName,
            transportRequest: transport_request,
          },
          {
            source: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
