/**
 * The verdict on a lock answer: a 2xx that names no lock handle is a refusal.
 *
 * adt-clients 23 reads the handle and answers `''` when there is none, where
 * 22 threw "Failed to obtain lock handle" — and leaves the verdict to the
 * caller's `analyse`, because the answer is in the response. An empty handle
 * is the symptom, not the fault: SAP answered the lock with something that is
 * not a lock answer — a login page on an expired session is a 200 too. Judged
 * after the fact, all a caller has is `''`; judged here, the failure carries
 * the response, so the answer SAP actually gave reaches the caller as
 * `raw_body`. A LockX tool used to hand `lock_handle: ""` back as a success,
 * and the next write failed on it with SAP's "invalid lock handle".
 *
 * Where a handle is, is the library's rule (`lockHandleOf`, not exported):
 * the `sap-adt-lm-handle` header — a function group — or
 * `asx:abap/asx:values/DATA/LOCK_HANDLE` in the body.
 *
 * Anything the transport already failed, or an exception document, is left to
 * `analyseException`, as for every other call.
 */
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import {
  ADT_NO_FAILURE,
  type IAdtError,
  type IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { attr, child, childAt, isList, text } from '../xml/tree';
import { parseStructure } from './reading';

/** A header's value as text: a string, or a list's first string; else empty. */
function headerValue(value: IAdtWireResponse['headers'][string]): string {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  const [first] = value;
  return typeof first === 'string' ? first.trim() : '';
}

/** Whether the answer names a lock handle, where adt-clients looks for one. */
export function carriesLockHandle(
  answer: IAdtWireResponse | undefined,
): boolean {
  // The answer is optional (`IAnalyse`); a wire answer's `headers` are not.
  if (headerValue(answer?.headers['sap-adt-lm-handle'])) return true;
  const handle = childAt(
    parseStructure(answer?.data),
    'asx:abap',
    'asx:values',
    'DATA',
    'LOCK_HANDLE',
  );
  return (text(handle) ?? '').trim() !== '';
}

export const analyseLock: IAnalyse<IAdtError> = (verdict, answer) => {
  const judged = analyseException(verdict, answer);
  if (judged !== ADT_NO_FAILURE) return judged;
  if (carriesLockHandle(answer)) return ADT_NO_FAILURE;
  // The wire answer's `request` is the transport's, typed `unknown`: read.
  const request = child(answer, 'request');
  const url = attr(request, 'url');
  return {
    origin: 'refusal',
    message:
      'SAP answered the lock request without a lock handle; the object is not locked',
    response: answer,
    ...(url ? { request: { method: attr(request, 'method'), url } } : {}),
  };
};

/**
 * A publication's lock: forgive the one `403`, refuse everything else — including
 * a `2xx` that names no handle.
 *
 * `analysePublicationLock` (adt-strategies) forgives a `403` because an editing
 * session holding the binding is not a reason to skip the job — the errata is
 * explicit, and Eclipse posts the job after its own LOCK's `403`. But it is built
 * on `analyseException`, which sees only documents: a `200` naming no handle is
 * no failure to it, so it answers no-failure there too and the caller is handed
 * the same empty handle as for the `403`. The two are not the same thing. A login
 * page on an expired session is a `200`, and publishing on the strength of it
 * would be writing after a lock that never happened.
 *
 * So this composes both readings, and the order matters: `analyseLock`'s check
 * first, so a `2xx` without a handle stays a refusal, and only then the `403`
 * forgiveness. An empty handle from this can therefore mean exactly one thing —
 * the `403` — which is what lets a caller publish without a handle and send no
 * UNLOCK.
 */
export const analysePublicationLockAnswer: IAnalyse<IAdtError> = (
  verdict,
  answer,
) => {
  // Judged as any other lock first, so a `2xx` naming no handle is a refusal.
  const judged = analyseLock(verdict, answer);
  if (judged === ADT_NO_FAILURE) return judged;
  // Then the one forgiveness. The status is read from the judged failure before
  // the answer because a `403` arrives thrown: adt-clients hands the analyse a
  // verdict whose `response` carries it, and `answer.status` can be undefined —
  // which is why `analysePublicationLock` reads it in that order too.
  const status = judged.response?.status ?? answer?.status;
  return status === 403 ? ADT_NO_FAILURE : judged;
};
