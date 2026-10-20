import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the RAP behavior implementation (its class) named by behavior_implementation_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description: 'BehaviorImplementation name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
        default: 'active',
      },
    },
    required: ['behavior_implementation_name'],
  },
} as const;

interface GetBehaviorImplementationArgs {
  behavior_implementation_name: string;
  part?: ReadPart;
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
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  // A behavior implementation is a class (`getBehaviorImplementation` is
  // typed against `classDocuments`, the same shipped set `handleGetClass`
  // uses), and its config field is `className`.
  const behaviorImplementationName = behavior_implementation_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getBehaviorImplementation(
    resultsFor(classDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetBehaviorImplementation', detail: 'terse' },
      () =>
        obj.readMetadata(
          { className: behaviorImplementationName },
          { analyse: analyseException },
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        behavior_implementation_name: behaviorImplementationName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
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
      part,
      source: source.raw,
    }),
  );
}
