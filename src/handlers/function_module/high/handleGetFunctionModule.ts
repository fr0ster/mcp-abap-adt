import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
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
import { readFunctionModuleMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description: `[read-only] Reads the ABAP function module named by function_module_name, BAPI or RFC-enabled ones included, in the function group named by function_group_name, in one request: its source code, which declares the parameter signature (part "source", the default), or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. ${SOURCE_RANGE_WORDS}`,
  inputSchema: z.object({
    function_module_name: z.string().describe('Function module name.'),
    function_group_name: z
      .string()
      .describe('Function group containing the function module.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

interface GetFunctionModuleArgs extends SourceRangeArgs {
  function_module_name: string;
  function_group_name: string;
  part?: ReadPart;
  version?: ReadVersion;
}

export async function handleGetFunctionModule(
  context: HandlerContext,
  args: GetFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_module_name,
    function_group_name,
    version = 'active',
  } = args;
  if (!function_module_name || !function_group_name)
    return return_error(
      new Error('function_module_name and function_group_name are required'),
    );
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getFunctionModule(resultsFor(functionModuleDocuments));

  // One request per call, at the group the caller gave: the part asked for,
  // and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetFunctionModule', detail: 'terse' },
      () =>
        readFunctionModuleMetadata(
          client,
          {
            functionModuleName,
            functionGroupName,
          },
          version,
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        function_module_name: functionModuleName,
        function_group_name: functionGroupName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetFunctionModule', detail: 'terse' },
    range,
    () =>
      obj.read({ functionModuleName, functionGroupName }, version, {
        analyse: analyseException,
      }),
    (source, cut) => ({
      success: true,
      function_module_name: functionModuleName,
      function_group_name: functionGroupName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
