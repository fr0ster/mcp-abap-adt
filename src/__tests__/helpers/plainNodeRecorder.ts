/**
 * The scenario side of `plainNode.ts`: records every unhandled rejection of
 * the plain-node process and writes the scenario's report as one JSON line
 * on stdout; the process then ends by itself. No test runner here: this runs
 * under plain node.
 */

const unhandled: string[] = [];

/** Starts recording; call it before the scenario does anything. */
export function recordUnhandled(): void {
  process.on('unhandledRejection', (reason) => {
    unhandled.push(
      reason instanceof Error ? `${reason.name}: ${reason.message}` : 'value',
    );
  });
}

/** Lets the rejections of the last turns surface: a few loop turns. */
export async function turns(n = 20): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Writes `facts` and the recorded rejections as the report; the process then
 * ends by itself, exit code 0, once the line is flushed and nothing is left
 * to run.
 *
 * Never `process.exit()`: it tears the platform down while V8's background
 * threads may still be working, and a background compile job that is waiting
 * for a garbage collection then waits for ever — the main thread is joining
 * it inside `NodePlatform::Shutdown` and runs no collection (measured on
 * Node 24: main thread in `node::WorkerThreadsTaskRunner::Shutdown` →
 * `uv_thread_join`; the V8 worker in `ConcurrentBaselineCompiler` →
 * `CollectionBarrier::AwaitCollectionBackground`). The scenario never exits
 * and the test waiting on it hangs. A natural end disposes the isolate
 * first, which releases such a job.
 */
export function report(facts: Record<string, unknown>): void {
  process.exitCode = 0;
  process.stdout.write(`${JSON.stringify({ ...facts, unhandled })}\n`);
}
