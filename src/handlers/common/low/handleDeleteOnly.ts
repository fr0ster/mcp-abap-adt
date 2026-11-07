/**
 * Compact `HandlerDelete`: one request per call (spec §4.6; the owner's rule —
 * compact is one ADT request per tool call).
 *
 * - The types a deletion request removes: that request alone, as
 *   adt-clients' `delete()` sends it. A deletion takes no lock — a lock held on
 *   the object is what makes ADT refuse it (`handleDeleteClass.ts`) — and the
 *   deletion check is a call of its own (`handleDeletionCheck`, compact's
 *   `HandlerDeletionCheck`). SAP's answer is the result, as it came.
 * - A class's local includes (LOCAL_TEST_CLASS, LOCAL_TYPES,
 *   LOCAL_DEFINITIONS, LOCAL_MACROS) and its unit tests (UNIT_TEST, the
 *   test classes include): a `DELETE` on an include answers `405` (measured
 *   on premise, 2026-10-17), so their removal is one `PUT` of empty content
 *   under the caller's `lock_handle` — the class lock. Locking, unlocking and
 *   activating the class are the consumer's own calls.
 *
 * CDS_UNIT_TEST's deletion removes its test class (`deletionTargets.ts`).
 * The full sets' `Delete<Type>` tools keep their chains.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type * as z from 'zod';
import { adtOperation } from '../../../lib/adtHeaders/defaultPairs';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { COMPACT_DELETE, supported } from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { compactDeleteSchema } from '../../../lib/compact/compactSchemas';
import {
  DELETION_CHECK_TYPES,
  DELETION_NAME_FIELDS,
  EMPTIED_INCLUDE_TYPES,
} from '../../../lib/compact/compactSchemas';
import type {
  HandlerContext,
  ToolArgs,
} from '../../../lib/handlers/interfaces';
import { lockHeldHere, lockNotHeldWords } from '../../../lib/state/heldLocks';
import {
  project,
  terseDeletion,
  terseWrite,
} from '../../../lib/strategies/projections';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { DELETION_TARGETS } from './deletionTargets';
import { CLASS_INCLUDES } from './handleUpdateUnderLock';

/**
 * HandlerDelete's arguments, as its schema parses them; `object_type` as any
 * string, since the boundary below reads the value as given (`acceptedOf`).
 */
type Args = Omit<z.output<typeof compactDeleteSchema>, 'object_type'> & {
  readonly object_type?: string;
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const ANSWER = { tool: 'HandlerDelete', detail: 'terse' } as const;

export async function handleDeleteOnly(
  context: HandlerContext,
  args: Args,
): Promise<unknown> {
  const objectType = String(args.object_type ?? '');
  const { connection, logger } = context;
  const transportRequest = text(args.transport_request);

  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_DELETE`); past it, the route is typed by it.
  const variant = variantOf(connection);
  const member = acceptedOf(objectType, COMPACT_DELETE[variant]);
  if (member === undefined) {
    return return_error(
      new Error(
        `Unsupported delete for object_type: ${objectType}. ${supported(COMPACT_DELETE[variant])}`,
      ),
    );
  }

  const emptied = EMPTIED_INCLUDE_TYPES.find((type) => type === member);
  if (emptied !== undefined) {
    const lockHandle = text(args.lock_handle);
    if (lockHandle === undefined) {
      return return_error(
        new Error(
          'lock_handle is required: the include is written empty under the lock handle of its class.',
        ),
      );
    }
    if (!lockHeldHere(context.heldLocks, lockHandle)) {
      return return_error(new Error(lockNotHeldWords(context.heldLocks)));
    }
    const className = text(args.class_name);
    if (className === undefined) {
      return return_error(new Error('class_name is required'));
    }
    const [, includeType, include] = CLASS_INCLUDES[emptied];
    return answer(
      ANSWER,
      () =>
        atStep('update', () =>
          withAdtHeaders(
            context,
            adtOperation(includeType, 'update'),
            (headers) =>
              include(createAdtClient(connection, logger)).update(
                {
                  className: className.toUpperCase(),
                  ...(transportRequest ? { transportRequest } : {}),
                },
                {
                  headers,
                  source: '',
                  lockHandle,
                  analyse: analyseException,
                },
              ),
          ),
        )(),
      project('terse', terseWrite),
    );
  }

  const removed = DELETION_CHECK_TYPES.find((type) => type === member);
  if (removed === undefined) {
    return return_error(
      new Error(`Unsupported delete for object_type: ${objectType}`),
    );
  }
  const target = DELETION_TARGETS[removed];
  const nameField = DELETION_NAME_FIELDS[removed];
  const given: ToolArgs = args;
  const name = text(given[nameField]);
  if (name === undefined) {
    return return_error(new Error(`${nameField} is required`));
  }
  let group: string | undefined;
  if (removed === 'FUNCTION_MODULE') {
    group = text(args.function_group_name);
    if (group === undefined) {
      return return_error(new Error('function_group_name is required'));
    }
  }
  return answer(
    ANSWER,
    () =>
      atStep('delete', () =>
        target.delete(
          context,
          connection,
          logger,
          {
            name: name.toUpperCase(),
            ...(group ? { group: group.toUpperCase() } : {}),
          },
          transportRequest,
        ),
      )(),
    // The metadata extension's DELETE answers an empty 2xx; every other
    // deletion a `del:deletionResult`.
    project(
      'terse',
      objectType === 'METADATA_EXTENSION' ? terseWrite : terseDeletion,
    ),
  );
}
