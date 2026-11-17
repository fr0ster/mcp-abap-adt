/**
 * Ask whether an object can be deleted, and delete it only if it can.
 *
 * `delete()` in adt-clients is the bare deletion: it no longer runs the check
 * itself (19 removed `assertDeletable`), and the deletion service refuses
 * nothing up front. So the check is the handler's to run. `checkDeletion`
 * names every reason an object cannot go — it does not exist, it is still
 * used (`externalStrongReferences`), it is locked in another request — and a
 * delete sent past any of them either fails with a vaguer reason or, for an
 * object that does not exist, answers in a way a caller reads as "deleted".
 *
 * A refused check is answered as it came, and `delete()` is never sent. On
 * premise (2026-09-26) the check answered `del:isDeletable="false"` with "Object
 * does not exist" for a missing table, and with "5 strong and 3 weak external
 * references" for a table still used by the shared CDS views; `analyseDeletion`
 * reads both as refusals.
 *
 * A check that permits the delete is followed by the delete, whatever its
 * messages say: on premise (2026-11-04) the check answered `isDeletable="true"`
 * with W "<name> does not exist" for an existing function module, function
 * include, inactive service definition and inactive service binding, and the
 * delete sent after it deleted each. The delete's own answer is relayed; a
 * refusal there is named by its T100 key (`analyseDeletion`).
 *
 * `deleteAnalyse` is the delete's own reading: the deletion service answers a
 * `del:deletionResult` (`analyseDeletion`), while an object deleted by a
 * DELETE on its own URL — the metadata extension — answers an empty 2xx.
 */

import type {
  IAdtError,
  IAdtHeaders,
  IAdtResponse,
  IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import { type AdtObjectWith, adtOperation } from '../adtHeaders/defaultPairs';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import { analyseDeletion } from './deletionRefusal';
import { atStep } from './step';
import type { StepResponse } from './stepResponse';

export interface CheckedDeletable<C, V> {
  checkDeletion(
    config: C,
    options: { headers: IAdtHeaders; analyse?: IAnalyse },
  ): Promise<IAdtResponse<V, IAdtError>>;
  delete(
    config: C,
    options: { headers: IAdtHeaders; analyse?: IAnalyse },
  ): Promise<IAdtResponse<V, IAdtError>>;
}

/** An object type whose `checkDeletion` and `delete` take a header pair. */
export type CheckedDeletableType = AdtObjectWith<'checkDeletion'> &
  AdtObjectWith<'delete'>;

/**
 * `object`'s deletion check, then its delete when the check permits it —
 * each with the header pair of `objectType`'s member (`withAdtHeaders`).
 */
export async function deleteIfDeletable<C, V>(
  context: AdtHeadersContext,
  objectType: CheckedDeletableType,
  object: CheckedDeletable<C, V>,
  config: C,
  deleteAnalyse: IAnalyse = analyseDeletion,
): Promise<StepResponse<V>> {
  const check = await atStep('delete check', () =>
    withAdtHeaders(
      context,
      adtOperation(objectType, 'checkDeletion'),
      (headers) =>
        object.checkDeletion(config, { headers, analyse: analyseDeletion }),
    ),
  )();
  if (!check.ok) return check;
  return atStep('delete', () =>
    withAdtHeaders(context, adtOperation(objectType, 'delete'), (headers) =>
      object.delete(config, { headers, analyse: deleteAnalyse }),
    ),
  )();
}
