/**
 * The package reader a strategy is handed (spec §3.2): created per checked
 * call, holding no connection. Its first read takes the call's connection
 * (`take`, the same acquisition the wrapper goes on with after an allowed
 * verdict); each read is one metadata read of one package on it, in the
 * call's signal scope. Nothing read is kept beyond the call.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { createAdtClient } from '../clients.js';
import { runWithRequestSignal } from '../requestSignal.js';
import { readPackageMetadata } from '../strategies/metadataReads.js';
import { packageSummary } from '../strategies/packageSummary.js';
import type { IPackageReader } from './accessChecks.js';

/** A read of a package's super package that SAP did not answer. */
export const PACKAGE_UNREADABLE_WORDS = 'the package could not be read';

/** A scope a read runs in: the call's, where the wrapper gives one. */
export type ReadScope = <T>(read: () => Promise<T>) => Promise<T>;

const noScope: ReadScope = (read) => read();

export function lazyPackageReader(
  take: () => Promise<IAbapConnection>,
  logger: ILogger | undefined,
  signal: AbortSignal,
  scope: ReadScope = noScope,
): IPackageReader {
  return {
    async superPackageOf(packageName) {
      const connection = await take();
      const read = await scope(() =>
        runWithRequestSignal(signal, () =>
          readPackageMetadata(
            createAdtClient(connection, logger),
            { packageName },
            'active',
          ),
        ),
      );
      if (!read.ok) throw new Error(PACKAGE_UNREADABLE_WORDS);
      return packageSummary(read.getResult().value.raw).super_package;
    },
  };
}
