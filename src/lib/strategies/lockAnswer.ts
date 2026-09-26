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

function headerValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return typeof value === 'string' ? value.trim() : '';
}

/** Whether the answer names a lock handle, where adt-clients looks for one. */
export function carriesLockHandle(
  answer: IAdtWireResponse | undefined,
): boolean {
  const headers = (answer?.headers ?? {}) as Record<string, unknown>;
  if (headerValue(headers['sap-adt-lm-handle'])) return true;
  const body = typeof answer?.data === 'string' ? answer.data : '';
  return /<LOCK_HANDLE>\s*[^<\s][^<]*<\/LOCK_HANDLE>/.test(body);
}

export const analyseLock: IAnalyse<IAdtError> = (verdict, answer) => {
  const judged = analyseException(verdict, answer);
  if (judged !== ADT_NO_FAILURE) return judged;
  if (carriesLockHandle(answer)) return ADT_NO_FAILURE;
  const request = (answer as { request?: { method?: string; url?: string } })
    ?.request;
  return {
    origin: 'refusal',
    message:
      'SAP answered the lock request without a lock handle; the object is not locked',
    response: answer,
    ...(request?.url
      ? { request: { method: request.method, url: request.url } }
      : {}),
  } as unknown as IAdtError;
};
