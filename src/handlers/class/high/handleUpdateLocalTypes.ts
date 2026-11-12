import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateLocalTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update local types definitions in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: z.object({
    class_name: z.string().describe('Parent class name.'),
    local_types_code: z
      .string()
      .describe('Updated source code for local types.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number (required for transportable objects), not a task.',
      ),
    activate_on_update: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Activate parent class after updating local types. Default: false',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateLocalTypesArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
        () => obj.lock({ className }, { analyse: analyseLock }),
        atStep('update', (lockHandle) =>
          withAdtHeaders(context, 'localTypes.update', (headers) =>
            obj.update(
              { className, transportRequest: args.transport_request },
              {
                headers,
                source: args.local_types_code,
                lockHandle,
                analyse: analyseException,
              },
            ),
          ),
        ),
        (lockHandle) =>
          obj.unlock({ className }, lockHandle, { analyse: analyseException }),
        { type: 'CLASS', name: className },
      );

      if (!written.ok || !shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'localTypes.activate', (headers) =>
            obj.activate(
              { className },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
