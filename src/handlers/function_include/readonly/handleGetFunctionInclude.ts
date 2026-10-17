import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'GetFunctionInclude',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an include of an ABAP function group in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata"). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group containing the include.',
      },
      include_name: {
        type: 'string',
        description: 'Include name.',
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
    required: ['function_group_name', 'include_name'],
  },
} as const;

interface GetFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
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

  const functionGroupName = function_group_name.toUpperCase();
  const includeName = include_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getFunctionInclude(
    resultsFor(functionIncludeDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetFunctionInclude', detail: 'terse' },
      () =>
        obj.readMetadata(
          { functionGroupName, includeName },
          { analyse: analyseException },
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
  return answer(
    { tool: 'GetFunctionInclude', detail: 'terse' },
    () =>
      obj.read({ functionGroupName, includeName }, version, {
        analyse: analyseException,
      }),
    (source: AdtReading<string>) => ({
      success: true,
      function_group_name: functionGroupName,
      include_name: includeName,
      version,
      part,
      source: source.raw,
    }),
  );
}
