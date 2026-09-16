/**
 * UpdateFunctionInclude Handler - Write a function group include's source
 *
 * Uses AdtClient.getFunctionInclude().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`.
 *
 * **This handler acquires its own lock.** `IFunctionIncludeContract`
 * composes `IAdtLockable`, so `lock({functionGroupName, includeName})` and
 * `unlock(config, lockHandle)` are on the same accessor `update()` is
 * called through — verified against `AdtFunctionInclude.js`
 * (`lock()`/`unlock()` call `lockFunctionInclude`/`unlockFunctionInclude`
 * directly). Fix round 1: a caller-supplied `lock_handle` param was tried
 * here first and reverted — adt-clients 19 moving a lock out of a member
 * does not move it onto the caller, it moves it onto this handler.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode` — `config.sourceCode` belongs to `check`
 * alone.
 *
 * Activation is restored: `activate()` is on the same accessor and
 * activates the include itself (a resource of its own, unlike the class
 * Local* writes), run after the lock is released, exactly as the
 * pre-migration handler's `activate` did.
 */

import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update. Subject: FunctionInclude. Will be useful for updating a function group include. Update source code of an existing ABAP function group include.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., ZOK_FG_MCP01).',
      },
      include_name: {
        type: 'string',
        description:
          'Include name (e.g., LZOK_FG_MCP01F01). Include must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP include source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable includes.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate the include after the source update. Default: false. Set true to make the updated source the active version immediately.',
        default: false,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'include_name', 'source_code'],
  },
} as const;

interface UpdateFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateFunctionInclude(
  context: HandlerContext,
  args: UpdateFunctionIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args.function_group_name || args.function_group_name.length > 30) {
    return return_error(
      new Error(
        'Function group name is required and must not exceed 30 characters',
      ),
    );
  }
  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }
  if (!args.source_code) {
    return return_error(new Error('source_code is required'));
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const includeName = args.include_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionInclude', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getFunctionInclude(
        resultsFor(functionIncludeDocuments),
      );

      const written = await withLock(
        () => obj.lock({ functionGroupName, includeName }),
        (lockHandle) =>
          obj.update(
            {
              functionGroupName,
              includeName,
              transportRequest: args.transport_request,
            },
            {
              sourceCode: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) =>
          obj.unlock({ functionGroupName, includeName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate(
        { functionGroupName, includeName },
        { analyse: analyseActivation },
      );
    },
    project(detail, terseWrite),
  );
}
