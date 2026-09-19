import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces';

/**
 * A real `IAbapConnection`, for tests that must run real adt-clients code
 * rather than a double of one of its members.
 *
 * `fakeClientOf`/`fakeClientOfWithFactory` (see `fakeClient.ts`) replace
 * `createAdtClient` itself, so a handler's own member call is asserted, but
 * nothing inside `@mcp-abap-adt/adt-clients` ever runs — a defect in how a
 * member composes its own inner delegate (an injected result set that never
 * reaches an object built without one, say) is invisible to that kind of
 * test by construction. This connection instead answers `makeAdtRequest`
 * itself, so `createAdtClient(recordingConnection(...), logger)` builds and
 * runs the real `AdtClient`/`AdtClass`/`AdtUnitTest`/etc., and the test
 * inspects the HTTP requests that code actually issued.
 */
export interface RecordedRequest {
  method: string;
  url: string;
  data?: unknown;
  params?: unknown;
}

export interface RecordingConnection extends IAbapConnection {
  readonly requests: RecordedRequest[];
}

/** A real captured `LOCK` response body (`lock-success--01-lock.body.xml`
 * in the corpus) — reused as the default answer to any `_action=LOCK`
 * request, so a channel test does not have to queue one by hand for every
 * lock a write takes on its way to the call under test. */
export const LOCK_SUCCESS_XML =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  '<asx:values><DATA><LOCK_HANDLE>B92E65858E83454C783181344F429D4BFD8E395D</LOCK_HANDLE>' +
  '<CORRNR/><CORRUSER/><CORRTEXT/><IS_LOCAL>X</IS_LOCAL><IS_LINK_UP/>' +
  '<MODIFICATION_SUPPORT>NoModification</MODIFICATION_SUPPORT><LINK_UP_MODE/>' +
  '<CORR_LOCKS/><CORR_CONTENTS/><SCOPE_MESSAGES/></DATA></asx:values></asx:abap>';

/**
 * `answers[i]` is what the i-th `makeAdtRequest` call receives back (partial
 * — `status: 200, statusText: 'OK', headers: {}` fill in whatever a case
 * does not name). Once the queue is exhausted — or at any index left
 * `undefined` — the default takes over: a `_action=LOCK` request answers
 * `LOCK_SUCCESS_XML` (a real lock handle, so a chain that locks before the
 * write under test does not need one queued by hand), and everything else
 * answers 200 with an empty body — a successful create, update, unlock or
 * activate all answer exactly that in the corpus.
 */
export function recordingConnection(
  answers: Array<Partial<IAdtWireResponse> | undefined> = [],
): RecordingConnection {
  const requests: RecordedRequest[] = [];
  let index = 0;

  return {
    requests,
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest(options) {
      requests.push({
        method: options.method,
        url: options.url,
        data: options.data,
        params: options.params,
      });
      const answer = answers[index];
      index += 1;
      const isLock =
        typeof options.url === 'string' && options.url.includes('_action=LOCK');
      return {
        data: answer?.data ?? (isLock ? LOCK_SUCCESS_XML : ''),
        status: answer?.status ?? 200,
        statusText: answer?.statusText ?? 'OK',
        headers: answer?.headers ?? {},
      };
    },
  };
}
