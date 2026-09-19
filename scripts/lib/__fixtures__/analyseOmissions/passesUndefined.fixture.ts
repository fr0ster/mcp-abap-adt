/**
 * Fixture for analyseOmissions.test.ts.
 *
 * The `analyse` key IS present in the object literal, but its value is
 * `undefined` — a key that says nothing. `carriesAnalyse` reads the TYPE of
 * the value, not the spelling of the key, so this must answer 'no', the same
 * as omitting the key.
 */
interface Options {
  analyse?: () => void;
}

declare const client: {
  activate(config: Record<string, unknown>, options?: Options): void;
};

export function callSite(): void {
  client.activate({}, { analyse: undefined });
}
