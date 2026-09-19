import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP RAP behavior implementation source code and metadata. Answers: "show behavior implementation", "display behavior pool code", "view RAP implementation X". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description: 'Behavior implementation name (e.g., ZBP_MY_CLASS).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['behavior_implementation_name'],
  },
} as const;

export async function handleReadBehaviorImplementation(
  context: HandlerContext,
  args: {
    behavior_implementation_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  const { behavior_implementation_name, version = 'active' } = args;
  if (!behavior_implementation_name)
    return return_error(new Error('behavior_implementation_name is required'));

  // A behavior implementation is a class (`getBehaviorImplementation` is
  // typed against `classDocuments`, the same shipped set `handleReadClass`
  // uses), and its config field is `className`.
  const behaviorImplementationName = behavior_implementation_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getBehaviorImplementation(
    resultsFor(classDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadBehaviorImplementation', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ className: behaviorImplementationName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata(
            { className: behaviorImplementationName },
            { analyse: analyseException },
          ),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      behavior_implementation_name: behaviorImplementationName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
