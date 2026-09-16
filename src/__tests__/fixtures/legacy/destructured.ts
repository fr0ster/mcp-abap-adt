/**
 * Fixture for legacyExposure.test.ts — a receiver reached through
 * destructuring rather than a plain `const` alias of a factory call.
 *
 * The old walk traced a `const`'s initializer expecting it to be the factory
 * call itself (or something it could unwrap down to one); a destructured
 * binding's initializer is the whole source object, not the property, so it
 * had nothing to trace into. `checker.getTypeAtLocation` on the destructured
 * identifier answers correctly regardless: it is a type query, not a search
 * for a specific initializer shape.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () => {
  const { pkg } = { pkg: client.getPackage() };
  return pkg.readMetadata({ packageName: 'ZP' });
};
