import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'GetFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP function module, BAPI or RFC-enabled ones included, in one request at the function group given: its source code, which declares the parameter signature (part "source", the default; active or inactive version), or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name.',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group containing the function module.',
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
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

interface GetFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
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

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getFunctionModule(
    resultsFor(functionModuleDocuments),
  );

  // One request per call, at the group the caller gave: the part asked for,
  // and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetFunctionModule', detail: 'terse' },
      () =>
        obj.readMetadata(
          { functionModuleName, functionGroupName },
          { analyse: analyseException },
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
  return answer(
    { tool: 'GetFunctionModule', detail: 'terse' },
    () =>
      obj.read({ functionModuleName, functionGroupName }, version, {
        analyse: analyseException,
      }),
    (source: AdtReading<string>) => ({
      success: true,
      function_module_name: functionModuleName,
      function_group_name: functionGroupName,
      version,
      part,
      source: source.raw,
    }),
  );
}
