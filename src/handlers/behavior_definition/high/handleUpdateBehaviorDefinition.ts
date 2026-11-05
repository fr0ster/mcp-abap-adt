import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateBehaviorDefinition Handler - ABAP Behavior Definition Update via ADT API
 *
 * Uses AdtClient.getBehaviorDefinition().{lock,update,unlock,read,activate}
 * from @mcp-abap-adt/adt-clients 19, through `withLock` when this handler
 * owns the lock — held for the whole write, released on every path out. A
 * caller who passes `lock_handle` already holds it, so `withLock` is
 * skipped and the update runs as the one request it is.
 *
 * The wait between the write and `activate` is the pre-migration handler's
 * long-polling `read({withLongPolling: true})`, discarded for its result
 * but not for what it does — see `handleUpdateDomain.ts` (high) for the
 * live incident this guards against, documented in `xmlPatch.ts`.
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
import {
  LOCK_NOT_HELD_WORDS,
  lockHeldHere,
} from '../../../lib/state/heldLocks';
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
    lock_handle: z
      .string()
      .optional()
      .describe(
        'Lock handle a lock of this server instance answered; the update is written under it. Absent: the update locks and unlocks the object itself.',
      ),
    activate: z
      .boolean()
      .optional()
      .describe('Activate after update. Default: true'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface UpdateBehaviorDefinitionArgs {
  name: string;
  source_code: string;
  transport_request?: string;
  lock_handle?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateBehaviorDefinition(
  context: HandlerContext,
  args: UpdateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;

  if (!args.name || !args.source_code) {
    return return_error(new Error('Missing required parameters'));
  }

  // A write under a caller's lock_handle is sent only under one this
  // instance's lock issued: SAP takes any handle in the locking session.
  if (args.lock_handle && !lockHeldHere(context.heldLocks, args.lock_handle)) {
    return return_error(new Error(LOCK_NOT_HELD_WORDS));
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

      const written = args.lock_handle
        ? await update(args.lock_handle)
        : await withLock(
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
