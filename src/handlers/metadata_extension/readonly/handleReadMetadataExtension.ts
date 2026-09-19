import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: MetadataExtension. Will be useful for reading, creating, or updating metadata extension. [read-only] Read ABAP metadata extension (DDLX) source code and metadata. Answers: "show metadata extension", "display DDLX source", "view UI annotations", "get metadata extension X". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata_extension_name: {
        type: 'string',
        description: 'Metadata extension name (e.g., Z_MY_DDLX).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['metadata_extension_name'],
  },
} as const;

export async function handleReadMetadataExtension(
  context: HandlerContext,
  args: {
    metadata_extension_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  const { metadata_extension_name, version = 'active' } = args;
  if (!metadata_extension_name)
    return return_error(new Error('metadata_extension_name is required'));

  // The config field is `name`, not `metadataExtensionName` — confirmed
  // against `IMetadataExtensionConfig`.
  const metadataExtensionName = metadata_extension_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getMetadataExtension(
    resultsFor(metadataExtensionDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadMetadataExtension', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ name: metadataExtensionName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata(
            { name: metadataExtensionName },
            { analyse: analyseException },
          ),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      metadata_extension_name: metadataExtensionName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
