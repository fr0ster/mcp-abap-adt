import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP package metadata (description, super-package, etc.). Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., Z_MY_PACKAGE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['package_name'],
  },
} as const;

interface GetPackageArgs {
  package_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetPackage(
  context: HandlerContext,
  args: GetPackageArgs,
) {
  const { connection, logger } = context;
  const { package_name, version = 'active' } = args;
  if (!package_name) return return_error(new Error('package_name is required'));

  const packageName = package_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getPackage(
    resultsFor(packageDocuments),
  );

  // A package is a container: it has no source of its own —
  // `IPackageContract` composes `IAdtMetadataReadable` and nothing else, so
  // unlike its siblings there is no `.read()` to call at all (same
  // defect/fix as `ReadPackage`). Unlike Domain, DataElement and
  // FunctionGroup, `AdtPackage` actually honours `version` — it forwards
  // `options.version` into the query string — so it is passed through here,
  // the same fix `ReadPackage` carries (task 11 fix round 1).
  return answer(
    { tool: 'GetPackage', detail: 'terse' },
    () =>
      obj.readMetadata({ packageName }, { version, analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      package_name: packageName,
      version,
      package_data: metadata.raw,
    }),
  );
}
