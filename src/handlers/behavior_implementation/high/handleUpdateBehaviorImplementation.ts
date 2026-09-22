/**
 * UpdateBehaviorImplementation Handler - Write a Behavior Implementation's
 * implementations include
 *
 * Uses AdtClient.getBehaviorImplementation().{lock,update,unlock,activate}
 * from @mcp-abap-adt/adt-clients 19, through `withLock`.
 *
 * **This handler acquires its own lock.** `AdtBehaviorImplementation
 * .update()` itself never locks — but the same accessor
 * (`getBehaviorImplementation()`) also exposes `lock()`/`unlock()`, which
 * delegate to the class's own lock (`this.class.lock({className})`,
 * `this.class.unlock(...)` — "A behavior implementation has no lock of its
 * own," its own doc comment says, meaning it borrows the class's rather than
 * having none reachable at all). So this handler locks, writes, and unlocks
 * through that same accessor — the same shape every already-migrated
 * high-tier locked write in this repository uses — rather than asking the
 * caller for a lock handle it has no other way to obtain. Fix round 1: a
 * caller-supplied `lock_handle` param, and a rename of `implementation_code`
 * to `source_code` and `class_name` to `behavior_implementation_name`, were
 * tried here first and reverted — adt-clients 19 moving a lock out of a
 * member does not move it onto the caller, and there was no reason to rename
 * either field.
 *
 * **`update()` writes the implementations include only, one request.** The
 * declaration file's own doc comment describes a two-write chain (main
 * source then include); the shipped `AdtBehaviorImplementation.js` does not
 * match it — `update()` makes exactly one `updateBehaviorImplementation()`
 * call, and no longer reads `behaviorDefinition` at all (its own comment:
 * "this writes the implementation include and never reads the definition's
 * name"). A class written through this handler does not get its
 * `FOR BEHAVIOR OF` clause from this call — that is `UpdateClass`'s, under
 * the same lock handle this handler's own `lock()`/`unlock()` would also
 * serve, were a caller to hold it open across both calls; this handler does
 * not offer that window, and takes and releases its own lock for its own
 * write instead.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode` only. Verified against
 * `AdtBehaviorImplementation.js`, not the declaration file.
 *
 * Activation is restored: `activate()` is on the same accessor (delegating
 * to `this.class.activate({className})`), run after the lock is released,
 * exactly as the pre-migration handler's `activate` did.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
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
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update source code of an existing ABAP behavior implementation class. Updates the implementations include. Manages lock, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system.',
      },
      behavior_definition: {
        type: 'string',
        description:
          'Referenced Behavior Definition name (e.g., ZI_MY_ENTITY). Accepted for compatibility; not forwarded to the write — the shipped update() no longer reads it (it writes the implementations include only, never the FOR BEHAVIOR OF main source).',
      },
      implementation_code: {
        type: 'string',
        description:
          'Implementation code for the implementations include. Contains the actual behavior implementation methods.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate behavior implementation after update. Default: true.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'behavior_definition', 'implementation_code'],
  },
} as const;

interface UpdateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  implementation_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateBehaviorImplementation(
  context: HandlerContext,
  args: UpdateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.behavior_definition) {
    return return_error(new Error('behavior_definition is required'));
  }
  if (!args?.implementation_code) {
    return return_error(new Error('implementation_code is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateBehaviorImplementation', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getBehaviorImplementation(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            {
              sourceCode: args.implementation_code,
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
