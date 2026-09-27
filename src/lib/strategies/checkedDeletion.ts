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
 * E19 (2026-09-26) the check answered `del:isDeletable="false"` with "Object
 * does not exist" for a missing table, and with "5 strong and 3 weak external
 * references" for a table still used by the shared CDS views; `analyseDeletion`
 * reads both as refusals.
 *
 * A check that permits the delete but says the object "does not exist" ends
 * it too, without an error: the answer is the check's, the delete is not sent.
 *
 * `deleteAnalyse` is the delete's own reading: the deletion service answers a
 * `del:deletionResult` (`analyseDeletion`), while an object deleted by a
 * DELETE on its own URL — the metadata extension — answers an empty 2xx.
 */

import type {
  IAdtError,
  IAdtResponse,
  IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import { absentPerCheck, analyseDeletion } from './deletionRefusal';

export interface CheckedDeletable<C, V> {
  checkDeletion(
    config: C,
    options?: { analyse?: IAnalyse<any> },
  ): Promise<IAdtResponse<unknown, IAdtError>>;
  delete(
    config: C,
    options?: { analyse?: IAnalyse<any> },
  ): Promise<IAdtResponse<V, IAdtError>>;
}

export async function deleteIfDeletable<C, V>(
  object: CheckedDeletable<C, V>,
  config: C,
  deleteAnalyse: IAnalyse<any> = analyseDeletion,
): Promise<IAdtResponse<V, IAdtError>> {
  const check = await object.checkDeletion(config, {
    analyse: analyseDeletion,
  });
  if (!check.ok) return check as unknown as IAdtResponse<V, IAdtError>;
  // Permitted, but not there: nothing to delete, so no delete is sent. The
  // check's answer is the result — `terseDeletion` reads it as `deleted:
  // false` with the warning. See `absentPerCheck`.
  const reading = (
    check.getResult() as { value?: { raw?: unknown } } | undefined
  )?.value;
  if (absentPerCheck(reading?.raw)) {
    return check as unknown as IAdtResponse<V, IAdtError>;
  }
  return object.delete(config, { analyse: deleteAnalyse });
}
