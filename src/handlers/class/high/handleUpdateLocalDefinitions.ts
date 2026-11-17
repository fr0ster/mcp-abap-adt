import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
import type { XmlRead } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'UpdateLocalDefinitions',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update local definitions (class-local types/constants) in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: z.object({
    class_name: z.string().describe('Parent class name.'),
    definitions_code: z
      .string()
      .describe('Updated source code for local definitions.'),
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
        'Activate parent class after updating local definitions. Default: false',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateLocalDefinitionsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
    async (): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalDefinitions(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }, { analyse: analyseLock }),
        atStep('update', (lockHandle) =>
          withAdtHeaders(context, 'localDefinitions.update', (headers) =>
            obj.update(
              { className, transportRequest: args.transport_request },
              {
                headers,
                source: args.definitions_code,
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
          withAdtHeaders(context, 'localDefinitions.activate', (headers) =>
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
