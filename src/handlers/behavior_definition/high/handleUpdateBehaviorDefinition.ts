import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateBehaviorDefinition Handler - ABAP Behavior Definition Update via ADT API
 *
 * Uses AdtClient.getBehaviorDefinition().{lock,update,unlock,read,activate}
 * from @mcp-abap-adt/adt-clients 19, through `withLock`: the handler locks,
 * writes and unlocks itself, the lock held for the whole write and released
 * on every path out. It takes no `lock_handle`: on the full set no tool
 * issues one (compact `HandlerUpdate` writes under a held lock).
 *
 * The wait between the write and `activate` is the pre-migration handler's
 * long-polling `read({withLongPolling: true})`, discarded for its result
 * but not for what it does — see `handleUpdateDomain.ts` (high) for the
 * live incident this guards against, documented in `documentPatch.ts`.
 *
 * **The source goes in `options`, not `config`.** See
 * `UpdateBehaviorDefinitionLow` — the shipped `AdtBehaviorDefinition.update()`
 * reads `options?.source` only.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer, unlessCredentialFailure } from '../../../lib/answer';
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
  name: 'UpdateBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update source code of an existing ABAP Behavior Definition (BDEF). Locks, updates, unlocks, and optionally activates.',
  inputSchema: z.object({
    name: z.string().describe('Behavior Definition name'),
    source_code: z.string().describe('New source code'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    activate: z
      .boolean()
      .optional()
      .describe('Activate after update. Default: true'),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateBehaviorDefinitionArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleUpdateBehaviorDefinition(
  context: HandlerContext,
  args: UpdateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;

  if (!args.name || !args.source_code) {
    return return_error(new Error('Missing required parameters'));
  }

  const name = args.name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateBehaviorDefinition', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getBehaviorDefinition(
        resultsFor(behaviorDefinitionDocuments),
      );

      const update = (lockHandle: string) =>
        withAdtHeaders(context, 'behaviorDefinition.update', (headers) =>
          obj.update(
            { name, transportRequest: args.transport_request },
            {
              headers,
              source: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        );

      const written = await withLock(
        () => obj.lock({ name }, { analyse: analyseLock }),
        atStep('update', update),
        (lockHandle) =>
          obj.unlock({ name }, lockHandle, { analyse: analyseException }),
        { type: 'BEHAVIOR_DEFINITION', name: name },
      );

      if (!written.ok) {
        return written;
      }

      // Best-effort (a credential failure ends the call): wait for the write to be visible before activating.
      await obj
        .read({ name }, 'inactive', {
          withLongPolling: true,
          analyse: analyseException,
        })
        .catch(unlessCredentialFailure);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'behaviorDefinition.activate', (headers) =>
            obj.activate({ name }, { headers, analyse: analyseActivation }),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
