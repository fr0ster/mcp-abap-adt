import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { sourceReader, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_PART_FIELD, readPartOf } from '../../../lib/handlers/readPart';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readBehaviorDefinitionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'a RAP behavior definition',
      metadata: true,
    }),
  ),
  inputSchema: z.object({
    behavior_definition_name: requiredText(
      'behavior_definition_name is required',
    ).describe('BehaviorDefinition name.'),
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
