import { classDocuments } from '@mcp-abap-adt/adt-clients';
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
import { readClassMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetClass',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the ABAP class named by class_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    class_name: z.string().describe('Class name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetClassArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetClass(
  context: HandlerContext,
  args: GetClassArgs,
) {
  const { connection, logger } = context;
  const { class_name, version = 'active' } = args;
  if (!class_name) return return_error(new Error('class_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const className = class_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getClass(resultsFor(classDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetClass', detail: 'terse' },
      () => readClassMetadata(client, { className }, version),
      (metadata: AdtReading<string>) => ({
        success: true,
        class_name: className,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetClass', detail: 'terse' },
    range,
    () => obj.read({ className }, version, { analyse: analyseException }),
    (source, cut) => ({
      success: true,
      class_name: className,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
