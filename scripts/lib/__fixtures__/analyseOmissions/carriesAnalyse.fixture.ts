/**
 * Fixture for analyseOmissions.test.ts.
 *
 * A clean call: `analyse` is set to a value the checker can prove is never
 * `undefined`. This is the control — it must be inspected (the parameter
 * accepts `analyse`) and must NOT be reported as an offender.
 */
interface Options {
  analyse?: () => void;
}

declare const client: {
  activate(config: Record<string, unknown>, options?: Options): void;
};

export function callSite(): void {
  client.activate({}, { analyse: () => undefined });
}
