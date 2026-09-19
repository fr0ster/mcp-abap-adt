import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: BehaviorDefinition. Will be useful for reading, creating, or updating behavior definition. [read-only] Read ABAP RAP behavior definition (BDEF) source code and metadata. Answers: "show behavior definition", "display BDEF source", "view RAP behavior X", "get behavior definition code". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'Behavior definition name (e.g., Z_MY_BDEF).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['behavior_definition_name'],
  },
} as const;

export async function handleReadBehaviorDefinition(
  context: HandlerContext,
  args: {
    behavior_definition_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  const { behavior_definition_name, version = 'active' } = args;
  if (!behavior_definition_name)
    return return_error(new Error('behavior_definition_name is required'));

  // The config field is `name`, not `behaviorDefinitionName` — confirmed
  // against `IBehaviorDefinitionConfig`.
  const behaviorDefinitionName = behavior_definition_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getBehaviorDefinition(
    resultsFor(behaviorDefinitionDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadBehaviorDefinition', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ name: behaviorDefinitionName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata(
            { name: behaviorDefinitionName },
            { analyse: analyseException },
          ),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      behavior_definition_name: behaviorDefinitionName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
