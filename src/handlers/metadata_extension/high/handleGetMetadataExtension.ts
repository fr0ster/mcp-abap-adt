import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_FIELD,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  SOURCE_RANGE_WORDS,
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readMetadataExtensionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the CDS metadata extension named by metadata_extension_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    metadata_extension_name: z.string().describe('MetadataExtension name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetMetadataExtensionArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

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
        readMetadataExtensionMetadata(
          client,
          { name: metadataExtensionName },
          version,
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        metadata_extension_name: metadataExtensionName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetMetadataExtension', detail: 'terse' },
    range,
    () =>
      obj.read({ name: metadataExtensionName }, version, {
        analyse: analyseException,
      }),
    (source, cut) => ({
      success: true,
      metadata_extension_name: metadataExtensionName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
