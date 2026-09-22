/**
 * Releasing a lock a test left behind.
 *
 * **Why a test needs this at all.** A freshly created Workbench object is
 * left under a real SAP ENQUEUE lock — SAP says so itself, `EU510`, "This
 * object is currently being edited" — the same lock SE80 and Eclipse hold
 * while an editing session is open. A lock → write → unlock cycle closes it;
 * a test that creates an object and then fails on the next assertion never
 * gets there, and the lock outlives the process. SM12 by hand is the
 * alternative, and it was needed more than once while the transport-object
 * suite was being written.
 *
 * `LambdaTester` already does this for the suites built on it, as a
 * `protected` member that resolves the object's URI from the handler's NAME.
 * A standalone suite has no handler name, so the two requests live here
 * taking the URI directly — the same `deletion/check` to ask whether a lock
 * is held, and the same `ddic/ddlock/locks` to drop it.
 */

/** ADT addresses for the object kinds a standalone suite creates. */
export const OBJECT_URIS = {
  program: (name: string) =>
    `/sap/bc/adt/programs/programs/${name.toLowerCase()}`,
  class: (name: string) => `/sap/bc/adt/oo/classes/${name.toLowerCase()}`,
} as const;

/**
 * Drop the lock on an object if one is held. Never throws: this runs in
 * cleanup, where a failure to tidy up must not replace the failure that
 * brought us here.
 */
export async function releaseObjectLockIfHeld(
  connection: any,
  objectUri: string,
  objectName: string,
  logger?: any,
): Promise<boolean> {
  try {
    const checked = await connection.makeAdtRequest({
      url: '/sap/bc/adt/deletion/check',
      method: 'POST',
      timeout: 30000,
      data:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
        `<del:object adtcore:uri="${objectUri}"/></del:checkRequest>`,
      headers: {
        Accept: 'application/vnd.sap.adt.deletion.check.response.v1+xml',
        'Content-Type': 'application/vnd.sap.adt.deletion.check.request.v1+xml',
      },
    });
    const answer = typeof checked.data === 'string' ? checked.data : '';
    // Both halves matter: `isDeletable="false"` alone can mean the object is
    // simply not deletable by this user, and `lockUser` is what says a lock
    // is the reason.
    const held =
      answer.includes('isDeletable="false"') && answer.includes('lockUser');
    if (!held) return false;

    logger?.warn?.(`🔒 ${objectName} is locked — releasing before cleanup`);
    await connection.makeAdtRequest({
      url: `/sap/bc/adt/ddic/ddlock/locks?lockAction=DELETE&name=${encodeURIComponent(objectName)}`,
      method: 'POST',
      timeout: 30000,
      data: '',
      headers: {},
    });
    logger?.warn?.(`🔓 released the lock on ${objectName}`);
    return true;
  } catch (error: any) {
    logger?.warn?.(
      `could not release the lock on ${objectName}: ${error?.message ?? error}`,
    );
    return false;
  }
}

/**
 * Whether this machine has a SAP system configured at all.
 *
 * The one legitimate reason an integration suite may skip itself. Everything
 * else — a missing package, an unset transport, a user the system will not
 * name — is a fault on a machine that HAS a system, and a fault that skips is
 * a fault nobody sees.
 */
export function sapIsConfigured(): boolean {
  const url = process.env.SAP_URL?.split('#')[0].trim();
  return !!url && /^https?:\/\//.test(url);
}

/**
 * Who the current session is, according to the system.
 *
 * `/sap/bc/adt/core/http/systeminformation` is a cloud endpoint: on-premise
 * there is nothing there and this answers `undefined`, which is the shape a
 * caller wants — the configured `SAP_USERNAME` is the on-premise answer and
 * should win anyway. It exists because a JWT session has no such variable,
 * and a suite that needs an owner was skipping invisibly without one.
 */
export async function systemUserName(
  connection: any,
  logger?: any,
): Promise<string | undefined> {
  try {
    const answered = await connection.makeAdtRequest({
      url: '/sap/bc/adt/core/http/systeminformation',
      method: 'GET',
      timeout: 30000,
      headers: {
        Accept: 'application/vnd.sap.adt.core.http.systeminformation.v1+json',
      },
      params: { _: Date.now() },
    });
    const data =
      typeof answered.data === 'string'
        ? JSON.parse(answered.data)
        : answered.data;
    const name = String(data?.userName ?? '').trim();
    return name === '' ? undefined : name;
  } catch (error: any) {
    logger?.debug?.(
      `systeminformation did not answer: ${error?.message ?? error}`,
    );
    return undefined;
  }
}
