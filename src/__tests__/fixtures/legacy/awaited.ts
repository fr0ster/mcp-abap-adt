/**
 * Fixture for legacyExposure.test.ts — a receiver produced by `await`ing a
 * promise of the factory's result, bound to a `const` before use.
 *
 * `await`, unlike an `as any` assertion, does not erase the type at the
 * point of use: TypeScript already resolves `pkg`'s type through the awaited
 * promise, so `checker.getTypeAtLocation(pkg)` at the later call answers
 * `IPackageContract<R>` correctly without any special-casing of `await`.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

async function getPkgAsync() {
  return client.getPackage();
}

export const call = async () => {
  const pkg = await getPkgAsync();
  return pkg.readMetadata({ packageName: 'ZP' });
};
