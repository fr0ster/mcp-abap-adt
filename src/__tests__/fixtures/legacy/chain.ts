/**
 * Fixture for legacyExposure.test.ts — the direct form.
 *
 * `client.getPackage().readMetadata(...)` in one expression: the factory call
 * is the property-access one level in from the member call, the shape
 * `factoryOf`'s first branch exists for.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () =>
  client.getPackage().readMetadata({ packageName: 'ZP' });
