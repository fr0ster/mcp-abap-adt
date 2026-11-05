import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
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
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readFunctionIncludeMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionInclude',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the include named by include_name of the ABAP function group named by function_group_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata"), at the version asked. Returns the part read.',
  inputSchema: z.object({
    function_group_name: z
      .string()
      .describe('Function group containing the include.'),
    include_name: z.string().describe('Include name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

interface GetFunctionIncludeArgs extends SourceRangeArgs {
  function_group_name: string;
  include_name: string;
  part?: ReadPart;
  version?: ReadVersion;
}

export async function handleGetFunctionInclude(
  context: HandlerContext,
  args: GetFunctionIncludeArgs,
) {
  const { connection, logger } = context;
  const { function_group_name, include_name, version = 'active' } = args;
  if (!function_group_name || !include_name)
    return return_error(
      new Error('function_group_name and include_name are required'),
    );
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);
  const range = sourceRangeOf(args);
  if (range instanceof Error) return return_error(range);
  if (range !== undefined && part === 'metadata') {
    return return_error(
      new Error(
        'start_line and end_line cut the source: give them with part "source"',
      ),
    );
  }

  const functionGroupName = function_group_name.toUpperCase();
  const includeName = include_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getFunctionInclude(resultsFor(functionIncludeDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetFunctionInclude', detail: 'terse' },
      () =>
        readFunctionIncludeMetadata(
          client,
          { functionGroupName, includeName },
          version,
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        function_group_name: functionGroupName,
        include_name: includeName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetFunctionInclude', detail: 'terse' },
    range,
    () =>
      obj.read({ functionGroupName, includeName }, version, {
        analyse: analyseException,
      }),
    (source, cut) => ({
      success: true,
      function_group_name: functionGroupName,
      include_name: includeName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
