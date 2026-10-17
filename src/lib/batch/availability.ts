/**
 * Whether a destination has the communication batch (spec §11): learned from
 * the system's own answer, never from its type, release or connection kind.
 *
 * One port per destination record of the instance (the credential and the
 * target system its parameters are kept for, `BaseMcpServer`), never per
 * connection object: a listed long read runs each call on a fresh connection
 * of its own, and what one call learned holds for the next.
 *
 * Only the outer envelope response decides: a `404` to the envelope request
 * means the endpoint is not served, and from then on the destination's
 * multi-request reads run sequentially. Nothing else is a verdict — an inner
 * part's status is that item's answer, and any other envelope failure that
 * phase's. Nothing expires: the verdict lasts as long as the record.
 */

/** A destination's communication batch: available until its envelope met an outer `404`. */
export interface BatchAvailability {
  /** `false` once an envelope request of the destination was answered `404`. */
  available(): boolean;
  /** The status of an envelope request's own (outer) response. */
  noteOuterStatus(status: number): void;
}

/** The status an outer envelope response has when the endpoint is not served. */
export const NO_BATCH_ENDPOINT_STATUS = 404;

/** A new destination's port: available until told otherwise. */
export function createBatchAvailability(): BatchAvailability {
  let served = true;
  return {
    available: () => served,
    noteOuterStatus: (status) => {
      if (status === NO_BATCH_ENDPOINT_STATUS) served = false;
    },
  };
}
