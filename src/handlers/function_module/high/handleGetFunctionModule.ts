import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  purpose,
  sourceReader,
  toolDescription,
} from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_PART_FIELD, readPartOf } from '../../../lib/handlers/readPart';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import {
  inCheckedGroupOn,
  inGroupStated,
} from '../../../lib/strategies/functionModuleGroup';
import { readFunctionModuleMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'an ABAP function module',
      purpose: purpose(
        'Reads the source of an ABAP function module, BAPI and RFC-enabled ones too, with its parameter signature, at the version asked, or its metadata.',
      ),
      metadata: true,
    }),
  ),
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

type GetFunctionModuleArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getFunctionModule(resultsFor(functionModuleDocuments));

  // The metadata names the group holding the module, and SAP ignores the
  // group of the address (#2): the metadata read is the answer to part
  // "metadata", checked against the group given; part "source" reads it
  // first and the source only when the group holds the module.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetFunctionModule', detail: 'terse' },
      async () =>
        inGroupStated(
          await readFunctionModuleMetadata(
            client,
            { functionModuleName, functionGroupName },
            version,
          ),
          functionGroupName,
          functionModuleName,
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
      inCheckedGroupOn(
        client,
        functionGroupName,
        functionModuleName,
        () =>
          obj.read({ functionModuleName, functionGroupName }, version, {
            analyse: analyseException,
          }),
        version,
      ),
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
