/**
 * The scenario side of `plainNode.ts`: records every unhandled rejection of
 * the plain-node process and writes the scenario's report as one JSON line
 * on stdout, then ends the process. No Jest here: this runs under node.
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

/** Writes `facts` and the recorded rejections as the report, and exits. */
export function report(facts: Record<string, unknown>): never {
  process.stdout.write(`${JSON.stringify({ ...facts, unhandled })}\n`);
  process.exit(0);
}
