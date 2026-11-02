import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import {
  READ_VERSION_PROPERTY,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readBehaviorDefinitionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the RAP behavior definition named by behavior_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'BehaviorDefinition name.',
      },
      part: READ_PART_PROPERTY,
      version: READ_VERSION_PROPERTY,
    },
    required: ['behavior_definition_name'],
  },
} as const;

interface GetBehaviorDefinitionArgs {
  behavior_definition_name: string;
  part?: ReadPart;
  version?: ReadVersion;
}

export async function handleGetBehaviorDefinition(
  context: HandlerContext,
  args: GetBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { behavior_definition_name, version = 'active' } = args;
  if (!behavior_definition_name)
    return return_error(new Error('behavior_definition_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

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
  return answer(
    { tool: 'GetBehaviorDefinition', detail: 'terse' },
    () =>
      obj.read({ name: behaviorDefinitionName }, version, {
        analyse: analyseException,
      }),
    (source: AdtReading<string>) => ({
      success: true,
      behavior_definition_name: behaviorDefinitionName,
      version,
      part,
      source: source.raw,
    }),
  );
}
