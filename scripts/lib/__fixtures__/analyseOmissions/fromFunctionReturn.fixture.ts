/**
 * Fixture for analyseOmissions.test.ts.
 *
 * The options argument is not an object literal and not an identifier bound
 * by a `const` initialised with one — it is a function's return value,
 * assembled somewhere this module cannot see into. Whether it carries
 * `analyse` is genuinely not provable from the source at the call site, so
 * this must answer 'unknown', not 'no' — the message says to inline it
 * rather than claiming it is missing.
 */
interface Options {
  analyse?: () => void;
}

declare const client: {
  activate(config: Record<string, unknown>, options?: Options): void;
};

function buildOptions(): Options {
  return { analyse: () => undefined };
}

export function callSite(): void {
  client.activate({}, buildOptions());
}
