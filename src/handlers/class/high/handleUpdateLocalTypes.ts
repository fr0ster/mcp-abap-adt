/**
 * UpdateLocalTypes Handler - Write a class's local types include
 *
 * Uses AdtClient.getLocalTypes().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`. Same shape as
 * `UpdateLocalTestClass` — see its own doc comment for the full reasoning:
 * `AdtLocalTypes.update()` never locks itself, but the same accessor
 * composes `IAdtLockable`, delegating to the class's own lock, so this
 * handler acquires it rather than asking the caller for a handle it has no
 * other way to obtain.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.source ?? config.localTypesCode`. Verified against
 * `AdtLocalTypes.js`.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateLocalTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update local types definitions in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      local_types_code: {
        type: 'string',
        description: 'Updated source code for local types.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable objects).',
      },
      activate_on_update: {
        type: 'boolean',
        description:
          'Activate parent class after updating local types. Default: false',
        default: false,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'local_types_code'],
  },
} as const;

interface UpdateLocalTypesArgs {
  class_name: string;
  local_types_code: string;
  transport_request?: string;
  activate_on_update?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateLocalTypes(
  context: HandlerContext,
  args: UpdateLocalTypesArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.local_types_code) {
    return return_error(new Error('local_types_code is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate_on_update === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateLocalTypes', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalTypes(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            {
              source: args.local_types_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) => obj.unlock({ className }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return carryCleanup(written, () =>
        obj.activate({ className }, { analyse: analyseActivation }),
      );
    },
    project(detail, terseWrite),
  );
}
