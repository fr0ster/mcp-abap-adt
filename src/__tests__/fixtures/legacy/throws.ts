/**
 * Fixture for legacyExposure.test.ts — a factory `AdtClientLegacy` declares
 * never available. Unlike the four `LEGACY_NO_STRATEGY` factories, this one
 * does not answer a failure on legacy; it throws synchronously from the
 * factory call itself, before any member on its result could be reached.
 */
import type { AdtClient } from '@mcp-abap-adt/adt-clients';

declare const client: AdtClient;

export const call = () => client.getStructure().read({ structureName: 'Z' });
