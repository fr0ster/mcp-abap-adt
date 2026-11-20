/**
 * Plain-node scenario that never ends and writes no report: what a
 * hanging scenario looks like to `plainNode.ts`.
 */
setInterval(() => undefined, 1_000);
