import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
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
import { readBehaviorDefinitionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the RAP behavior definition named by behavior_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    behavior_definition_name: z.string().describe('BehaviorDefinition name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetBehaviorDefinitionArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetBehaviorDefinition(
  context: HandlerContext,
  args: GetBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { behavior_definition_name, version = 'active' } = args;
  if (!behavior_definition_name)
    return return_error(new Error('behavior_definition_name is required'));
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  // The config field is `name`, not `behaviorDefinitionName` — confirmed
  // against `IBehaviorDefinitionConfig`, and the pre-migration handler
  // already called it that way.
  const behaviorDefinitionName = behavior_definition_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getBehaviorDefinition(
    resultsFor(behaviorDefinitionDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetBehaviorDefinition', detail: 'terse' },
      () =>
        readBehaviorDefinitionMetadata(
          client,
          {
            name: behaviorDefinitionName,
          },
          version,
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        behavior_definition_name: behaviorDefinitionName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetBehaviorDefinition', detail: 'terse' },
    range,
    () =>
      obj.read({ name: behaviorDefinitionName }, version, {
        analyse: analyseException,
      }),
    (source, cut) => ({
      success: true,
      behavior_definition_name: behaviorDefinitionName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
