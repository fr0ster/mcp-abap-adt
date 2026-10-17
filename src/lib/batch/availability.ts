/**
 * Whether a destination has the communication batch (spec §11): learned from
 * the system's own answer, never from its type, release or connection kind.
 *
 * One port per destination record of the instance (the credential and the
 * target system its parameters are kept for, `BaseMcpServer`), never per
 * connection object: a listed long read runs each call on a fresh connection
 * of its own, and what one call learned holds for the next.
 *
 * Only the outer envelope response decides, and only its first verdict: the
 * first envelope request of the destination answered `2xx` means the
 * endpoint is served, for good; answered `404`, that it is not, and from then
 * on the destination's multi-request reads run sequentially. A status that is
 * neither (`500`, `403`, …) decides nothing. Once decided, nothing changes
 * the verdict: a later `404` is that phase's envelope failure. An inner
 * part's status is never a verdict either — it is that item's answer.
 * Nothing expires: the verdict lasts as long as the record.
 */

/** A destination's communication batch: available unless its first verdict was an outer `404`. */
export interface BatchAvailability {
  /** `false` once the destination's first verdict was an outer `404`. */
  available(): boolean;
  /** The status of an envelope request's own (outer) response. */
  noteOuterStatus(status: number): void;
}

/** The status an outer envelope response has when the endpoint is not served. */
export const NO_BATCH_ENDPOINT_STATUS = 404;

/** A new destination's port: undecided, available until its first verdict says otherwise. */
export function createBatchAvailability(): BatchAvailability {
  let verdict: 'served' | 'not-served' | undefined;
  return {
    available: () => verdict !== 'not-served',
    noteOuterStatus: (status) => {
      if (verdict !== undefined) return;
      if (status >= 200 && status < 300) verdict = 'served';
      else if (status === NO_BATCH_ENDPOINT_STATUS) verdict = 'not-served';
    },
  };
}
