import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP metadata extension definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata_extension_name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['metadata_extension_name'],
  },
} as const;

interface GetMetadataExtensionArgs {
  metadata_extension_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetMetadataExtension(
  context: HandlerContext,
  args: GetMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { metadata_extension_name, version = 'active' } = args;
  if (!metadata_extension_name)
    return return_error(new Error('metadata_extension_name is required'));

  // The config field is `name`, not `metadataExtensionName` — confirmed
  // against `IMetadataExtensionConfig` (same field `ReadMetadataExtension`
  // uses), and the pre-migration handler already called it that way.
  const metadataExtensionName = metadata_extension_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getMetadataExtension(
    resultsFor(metadataExtensionDocuments),
  );

  // GetMetadataExtension has only ever answered the source, not the
  // metadata — one call, unlike ReadMetadataExtension's pair.
  return answer(
    { tool: 'GetMetadataExtension', detail: 'terse' },
    () =>
      obj.read({ name: metadataExtensionName }, version, {
        analyse: analyseException,
      }),
    (source: AdtReading<string>) => ({
      success: true,
      metadata_extension_name: metadataExtensionName,
      version,
      metadata_extension_data: source.raw,
    }),
  );
}
