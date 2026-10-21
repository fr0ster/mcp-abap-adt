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
import { adtOperation } from '../../../lib/adtHeaders/defaultPairs';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  type DELETION_CHECK_TYPES,
  EMPTIED_INCLUDE_TYPES,
} from '../../../lib/compact/compactSchemas';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LOCK_NOT_HELD_WORDS,
  lockHeldHere,
} from '../../../lib/state/heldLocks';
import {
  project,
  terseDeletion,
  terseWrite,
} from '../../../lib/strategies/projections';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { deletionTargetOf } from './deletionTargets';
import { CLASS_INCLUDES } from './handleUpdateUnderLock';

/** The argument naming the object, per type a deletion request removes. */
export const DELETION_NAME_FIELDS: Readonly<
  Record<(typeof DELETION_CHECK_TYPES)[number], string>
> = {
  PACKAGE: 'package_name',
  DOMAIN: 'domain_name',
  DATA_ELEMENT: 'data_element_name',
  TABLE: 'table_name',
  STRUCTURE: 'structure_name',
  DDL: 'ddl_name',
  SERVICE_DEFINITION: 'service_definition_name',
  SERVICE_BINDING: 'service_binding_name',
  CLASS: 'class_name',
  CDS_UNIT_TEST: 'class_name',
  PROGRAM: 'program_name',
  INTERFACE: 'interface_name',
  FUNCTION_GROUP: 'function_group_name',
  FUNCTION_MODULE: 'function_module_name',
  BEHAVIOR_DEFINITION: 'behavior_definition_name',
  BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
  METADATA_EXTENSION: 'metadata_extension_name',
};

type Args = Record<string, unknown> & {
  object_type?: string;
  lock_handle?: string;
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

  if ((EMPTIED_INCLUDE_TYPES as readonly string[]).includes(objectType)) {
    const lockHandle = text(args.lock_handle);
    if (lockHandle === undefined) {
      return return_error(
        new Error(
          'lock_handle is required: the include is written empty under the lock handle of its class.',
        ),
      );
    }
    if (!lockHeldHere(context.heldLocks, lockHandle)) {
      return return_error(new Error(LOCK_NOT_HELD_WORDS));
    }
    const className = text(args.class_name);
    if (className === undefined) {
      return return_error(new Error('class_name is required'));
    }
    const [, includeType, include] = CLASS_INCLUDES[objectType];
    return answer(
      ANSWER,
      () =>
        atStep(
          'update',
          () =>
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
            ) as Promise<never>,
        )() as Promise<never>,
      project('terse', terseWrite),
    );
  }

  const target = deletionTargetOf(objectType);
  const nameField = (DELETION_NAME_FIELDS as Readonly<Record<string, string>>)[
    objectType
  ];
  if (target === undefined || nameField === undefined) {
    return return_error(
      new Error(`Unsupported delete for object_type: ${objectType}`),
    );
  }
  const name = text(args[nameField]);
  if (name === undefined) {
    return return_error(new Error(`${nameField} is required`));
  }
  let group: string | undefined;
  if (objectType === 'FUNCTION_MODULE') {
    group = text(args.function_group_name);
    if (group === undefined) {
      return return_error(new Error('function_group_name is required'));
    }
  }
  return answer(
    ANSWER,
    () =>
      atStep(
        'delete',
        () =>
          withAdtHeaders(
            context,
            adtOperation(target.objectType, 'delete'),
            (headers) =>
              target.object(createAdtClient(connection, logger)).delete(
                target.config(
                  {
                    name: name.toUpperCase(),
                    ...(group ? { group: group.toUpperCase() } : {}),
                  },
                  transportRequest,
                ),
                { headers, analyse: target.deleteAnalyse },
              ),
          ) as Promise<never>,
      )() as Promise<never>,
    // The metadata extension's DELETE answers an empty 2xx; every other
    // deletion a `del:deletionResult`.
    project(
      'terse',
      objectType === 'METADATA_EXTENSION' ? terseWrite : terseDeletion,
    ),
  );
}
