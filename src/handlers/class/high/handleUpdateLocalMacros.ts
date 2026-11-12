import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateLocalMacros Handler - Write a class's local macros include
 *
 * Uses AdtClient.getLocalMacros().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`. Same shape as
 * `UpdateLocalTestClass` — see its own doc comment for the full reasoning:
 * `AdtLocalMacros.update()` never locks itself, but the same accessor
 * composes `IAdtLockable`, delegating to the class's own lock, so this
 * handler acquires it rather than asking the caller for a handle it has no
 * other way to obtain.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.source ?? config.macrosCode`. Verified against
 * `AdtLocalMacros.js`.
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
  name: 'UpdateLocalMacros',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update local macros in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: z.object({
    class_name: z.string().describe('Parent class name.'),
    macros_code: z.string().describe('Updated source code for local macros.'),
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
        'Activate parent class after updating local macros. Default: false',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateLocalMacrosArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateLocalMacros(
  context: HandlerContext,
  args: UpdateLocalMacrosArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.macros_code) {
    return return_error(new Error('macros_code is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate_on_update === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateLocalMacros', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalMacros(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }, { analyse: analyseLock }),
        atStep('update', (lockHandle) =>
          withAdtHeaders(context, 'localMacros.update', (headers) =>
            obj.update(
              { className, transportRequest: args.transport_request },
              {
                headers,
                source: args.macros_code,
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
          withAdtHeaders(context, 'localMacros.activate', (headers) =>
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
