/**
 * UpdateLocalDefinitions Handler - Write a class's local definitions include
 *
 * Uses AdtClient.getLocalDefinitions().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`. Same shape as
 * `UpdateLocalTestClass` — see its own doc comment for the full reasoning:
 * `AdtLocalDefinitions.update()` never locks itself, but the same accessor
 * composes `IAdtLockable`, delegating to the class's own lock, so this
 * handler acquires it rather than asking the caller for a handle it has no
 * other way to obtain.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.source ?? config.definitionsCode`. Verified against
 * `AdtLocalDefinitions.js`.
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
  name: 'UpdateLocalDefinitions',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update local definitions (class-local types/constants) in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      definitions_code: {
        type: 'string',
        description: 'Updated source code for local definitions.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable objects). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      activate_on_update: {
        type: 'boolean',
        description:
          'Activate parent class after updating local definitions. Default: false',
        default: false,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'definitions_code'],
  },
} as const;

interface UpdateLocalDefinitionsArgs {
  class_name: string;
  definitions_code: string;
  transport_request?: string;
  activate_on_update?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateLocalDefinitions(
  context: HandlerContext,
  args: UpdateLocalDefinitionsArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.definitions_code) {
    return return_error(new Error('definitions_code is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate_on_update === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateLocalDefinitions', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalDefinitions(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            {
              source: args.definitions_code,
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
