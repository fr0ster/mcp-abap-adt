/**
 * UpdateLocalTestClass Handler - Write a class's testclasses include
 *
 * Uses AdtClient.getLocalTestClass().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — the lock is held for
 * the write and released on every path out.
 *
 * **This handler acquires its own lock.** `AdtLocalTestClass.update()`
 * itself "never takes a lock and never releases one" (its own doc comment)
 * — but the SAME accessor (`getLocalTestClass()`) also composes
 * `IAdtLockable`, delegating to the class's own lock
 * (`AdtClassMemberBase.lock()`: "This is the lock an include is written
 * under too: ADT locks `/oo/classes/{name}`... and the PUT that writes the
 * include carries the class's handle"). So this handler locks the class
 * itself, writes under that handle, and unlocks — the same shape every
 * already-migrated high-tier locked write in this repository uses — rather
 * than asking the caller for a lock handle it has no other way to obtain.
 * Fix round 1: a caller-supplied `lock_handle` param was tried here first
 * and reverted; adt-clients 19 moving a lock out of a member does not move
 * it onto the caller, it moves it onto this handler.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.source ?? config.source`. Verified against
 * `AdtLocalTestClass.js`.
 *
 * Activation is restored: `activate()` is on the same accessor (delegating
 * to the class's own activate — "An include has no activation of its own —
 * activating the class publishes whatever its includes now contain"), run
 * after the lock is released, exactly as the pre-migration handler's
 * `activate_on_update` did.
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
  name: 'UpdateLocalTestClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update a local test class in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      test_class_code: {
        type: 'string',
        description: 'Updated source code for the local test class.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable objects). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      activate_on_update: {
        type: 'boolean',
        description:
          'Activate parent class after updating test class. Default: false',
        default: false,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'test_class_code'],
  },
} as const;

interface UpdateLocalTestClassArgs {
  class_name: string;
  test_class_code: string;
  transport_request?: string;
  activate_on_update?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateLocalTestClass(
  context: HandlerContext,
  args: UpdateLocalTestClassArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.test_class_code) {
    return return_error(new Error('test_class_code is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate_on_update === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateLocalTestClass', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalTestClass(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            {
              source: args.test_class_code,
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
