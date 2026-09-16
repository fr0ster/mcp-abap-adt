/**
 * Fixture for legacyExposure.test.ts — a receiver reached through a shared
 * helper function rather than a call directly on `client`.
 *
 * The old syntax-directed walk only followed `client.getX()` chains and
 * `const` aliases of one; a helper that returns the same factory's result
 * was invisible to it. Type-based resolution needs no special case here:
 * `checker.getTypeAtLocation(pkg)` already answers `IPackageContract<R>`,
 * because that is what `getPkg`'s own return type says, regardless of how
 * the value inside it was produced.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

function getPkg() {
  return client.getPackage();
}

export const call = () => {
  const pkg = getPkg();
  return pkg.readMetadata({ packageName: 'ZP' });
};
