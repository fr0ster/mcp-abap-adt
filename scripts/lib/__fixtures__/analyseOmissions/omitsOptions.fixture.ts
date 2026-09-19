/**
 * Fixture for analyseOmissions.test.ts.
 *
 * `activate` accepts an optional `options`, and this call passes none at
 * all — a member that could have been given a strategy and was not. This is
 * the shape `client.getDomain().lock({ domainName })` predates in spirit:
 * an omitted, fully optional options argument.
 */
interface Options {
  analyse?: () => void;
}

declare const client: {
  activate(config: Record<string, unknown>, options?: Options): void;
};

export function callSite(): void {
  client.activate({});
}
