/**
 * Fixture for legacyExposure.test.ts — the form most call sites use.
 *
 * The factory's result is held in a `const` first, and the member is called
 * on that local a statement later. `factoryOf` has to follow the identifier
 * back to its initializer to see through this one.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () => {
  const pkg = client.getPackage();
  return pkg.readMetadata({ packageName: 'ZP' });
};
