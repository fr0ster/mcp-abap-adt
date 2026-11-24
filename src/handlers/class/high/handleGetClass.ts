import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { sourceReader, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
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
  description: toolDescription(
    sourceReader({
      object: 'an ABAP class',
      range: 'with-count',
      metadata: true,
    }),
  ),
  inputSchema: z.object({
    class_name: requiredText('class_name is required').describe('Class name.'),
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
  const part = readPartOf(args.part);
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
