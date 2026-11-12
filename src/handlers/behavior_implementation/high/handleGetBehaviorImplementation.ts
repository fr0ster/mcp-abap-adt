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
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the RAP behavior implementation (its class) named by behavior_implementation_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    behavior_implementation_name: z
      .string()
      .describe('BehaviorImplementation name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetBehaviorImplementationArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

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
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

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
          { version, analyse: analyseException },
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        behavior_implementation_name: behaviorImplementationName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetBehaviorImplementation', detail: 'terse' },
    range,
    () =>
      obj.read({ className: behaviorImplementationName }, version, {
        analyse: analyseException,
      }),
    (source, cut) => ({
      success: true,
      behavior_implementation_name: behaviorImplementationName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
