/**
 * Plain-node scenario that never ends and writes no report: what a
 * scenario hanging past Jest's timeout looks like to `plainNode.ts`.
 */
setInterval(() => undefined, 1_000);
