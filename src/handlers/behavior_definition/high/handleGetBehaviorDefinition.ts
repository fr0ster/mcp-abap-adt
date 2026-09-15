import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP behavior definition definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['behavior_definition_name'],
  },
} as const;

interface GetBehaviorDefinitionArgs {
  behavior_definition_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetBehaviorDefinition(
  context: HandlerContext,
  args: GetBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { behavior_definition_name, version = 'active' } = args;
  if (!behavior_definition_name)
    return return_error(new Error('behavior_definition_name is required'));

  // The config field is `name`, not `behaviorDefinitionName` — confirmed
  // against `IBehaviorDefinitionConfig`, and the pre-migration handler
  // already called it that way.
  const behaviorDefinitionName = behavior_definition_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getBehaviorDefinition(
    resultsFor(behaviorDefinitionDocuments),
  );

  // GetBehaviorDefinition has only ever answered the source, not the
  // metadata — one call, unlike ReadBehaviorDefinition's pair.
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
      behavior_definition_data: source.raw,
    }),
  );
}
