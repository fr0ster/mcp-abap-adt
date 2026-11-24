/**
 * Plain-node scenario that writes a valid report and then fails: exit code
 * 1. What a scenario that broke after its report looks like to
 * `plainNode.ts`, which must count it as a failure, not as the report.
 */
process.stdout.write(`${JSON.stringify({ unhandled: [] })}\n`);
process.exitCode = 1;
