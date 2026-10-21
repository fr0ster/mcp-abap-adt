import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import { readMetadataExtensionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the CDS metadata extension named by metadata_extension_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata_extension_name: {
        type: 'string',
        description: 'MetadataExtension name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
        default: 'active',
      },
    },
    required: ['metadata_extension_name'],
  },
} as const;

interface GetMetadataExtensionArgs {
  metadata_extension_name: string;
  part?: ReadPart;
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
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  // The config field is `name`, not `metadataExtensionName` — confirmed
  // against `IMetadataExtensionConfig`, and the pre-migration handler
  // already called it that way.
  const metadataExtensionName = metadata_extension_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getMetadataExtension(
    resultsFor(metadataExtensionDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetMetadataExtension', detail: 'terse' },
      () =>
        readMetadataExtensionMetadata(client, { name: metadataExtensionName }),
      (metadata: AdtReading<string>) => ({
        success: true,
        metadata_extension_name: metadataExtensionName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
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
      part,
      source: source.raw,
    }),
  );
}
