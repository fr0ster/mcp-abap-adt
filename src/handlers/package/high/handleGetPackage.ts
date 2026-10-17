import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { readPackageMetadata } from '../../../lib/strategies/metadataReads';
import {
  packageDetails,
  packageSummary,
} from '../../../lib/strategies/packageSummary';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP package in one request: its ADT metadata document (description, super-package, sub-packages, ...), active or inactive version. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['package_name'],
  },
} as const;

interface GetPackageArgs {
  package_name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetPackage(
  context: HandlerContext,
  args: GetPackageArgs,
) {
  const { connection, logger } = context;
  const { package_name, version = 'active' } = args;
  if (!package_name) return return_error(new Error('package_name is required'));

  const packageName = package_name.toUpperCase();
  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);

  // A package is a container: it has no source of its own —
  // `IPackageContract` composes `IAdtMetadataReadable` and nothing else, so
  // unlike its siblings there is no `.read()` to call at all. Unlike Domain, DataElement and
  // FunctionGroup, `AdtPackage` actually honours `version` — it forwards
  // `options.version` into the query string — so it is passed through here
  // (task 11 fix round 1).
  return answer(
    { tool: 'GetPackage', detail },
    () => readPackageMetadata(client, { packageName }, version),
    (metadata: AdtReading<string>) => ({
      success: true,
      package_name: packageName,
      version,
      part: 'metadata',
      metadata:
        detail === 'raw'
          ? metadata.raw
          : detail === 'full'
            ? packageDetails(metadata.raw)
            : packageSummary(metadata.raw),
    }),
  );
}
