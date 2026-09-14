import { packageDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadPackage',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Read ABAP package definition and metadata. Answers: "show package X", "display package properties", "view package contents", "get package info". Returns definition, super-package, responsible, description.',
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
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['package_name'],
  },
} as const;

export async function handleReadPackage(
  context: HandlerContext,
  args: { package_name: string; version?: 'active' | 'inactive' },
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
  // unlike its siblings in this family there is no `.read()` to call at all:
  // `read` and `readMetadata` fetched the identical document even before 19.
  // One call, used for both fields this tool has always answered.
  return answer(
    { tool: 'ReadPackage', detail: 'terse' },
    () => obj.readMetadata({ packageName }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      package_name: packageName,
      version,
      source_code: metadata.raw,
      metadata: metadata.raw,
    }),
  );
}
