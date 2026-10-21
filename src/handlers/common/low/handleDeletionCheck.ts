/**
 * Compact `HandlerDeletionCheck`: the deletion check alone, one request
 * (`POST /sap/bc/adt/deletion/check`, adt-clients' `checkDeletion`), read by
 * `analyseDeletion` — SAP's verdict as it came: permitted (`deletable: true`,
 * with SAP's message when it carries one — a permitted check whose message
 * says the object does not exist included), or refused with SAP's words.
 *
 * The check asks about the object compact's delete removes, for every type a
 * deletion request removes (`deletionTargets.ts`). Nothing is changed.
 */

import { adtOperation } from '../../../lib/adtHeaders/defaultPairs';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import {
  project,
  terseDeletionCheck,
} from '../../../lib/strategies/projections';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { deletionTargetOf } from './deletionTargets';

type Args = { object_type?: unknown; object_name?: unknown };

const ANSWER = { tool: 'HandlerDeletionCheck', detail: 'terse' } as const;

export async function handleDeletionCheck(
  context: HandlerContext,
  args: Args,
): Promise<unknown> {
  const objectType = String(args?.object_type ?? '');
  const target = deletionTargetOf(objectType);
  if (target === undefined) {
    return return_error(
      new Error(`Unsupported deletion check for object_type: ${objectType}`),
    );
  }
  const objectName =
    typeof args.object_name === 'string' ? args.object_name.trim() : '';
  if (objectName === '') {
    return return_error(new Error('object_name is required'));
  }
  let name = objectName.toUpperCase();
  let group: string | undefined;
  if (objectType === 'FUNCTION_MODULE') {
    // A function module is named under its group: GROUP|MODULE.
    const [g, m] = name.split('|');
    if (!g || !m) {
      return return_error(
        new Error('A function module is named GROUP|MODULE, its group first'),
      );
    }
    group = g.trim();
    name = m.trim();
  }
  const { connection, logger } = context;
  return answer(
    ANSWER,
    () =>
      atStep(
        'delete check',
        () =>
          withAdtHeaders(
            context,
            adtOperation(target.objectType, 'checkDeletion'),
            (headers) =>
              target
                .object(createAdtClient(connection, logger))
                .checkDeletion(
                  target.config({ name, ...(group ? { group } : {}) }),
                  { headers, analyse: analyseDeletion },
                ),
          ) as Promise<never>,
      )() as Promise<never>,
    project('terse', terseDeletionCheck),
  );
}
