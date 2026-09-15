import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP behavior implementation definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description:
          'BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['behavior_implementation_name'],
  },
} as const;

interface GetBehaviorImplementationArgs {
  behavior_implementation_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetBehaviorImplementation(
  context: HandlerContext,
  args: GetBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  const { behavior_implementation_name, version = 'active' } = args;
  if (!behavior_implementation_name)
    return return_error(new Error('behavior_implementation_name is required'));

  // A behavior implementation is a class (`getBehaviorImplementation` is
  // typed against `classDocuments`, the same shipped set `handleGetClass`
  // uses), and its config field is `className` — same as
  // `ReadBehaviorImplementation`.
  const behaviorImplementationName = behavior_implementation_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getBehaviorImplementation(
    resultsFor(classDocuments),
  );

  // GetBehaviorImplementation has only ever answered the source, not the
  // metadata — one call, unlike ReadBehaviorImplementation's pair.
  return answer(
    { tool: 'GetBehaviorImplementation', detail: 'terse' },
    () =>
      obj.read({ className: behaviorImplementationName }, version, {
        analyse: analyseException,
      }),
    (source: AdtReading<string>) => ({
      success: true,
      behavior_implementation_name: behaviorImplementationName,
      version,
      behavior_implementation_data: source.raw,
    }),
  );
}
