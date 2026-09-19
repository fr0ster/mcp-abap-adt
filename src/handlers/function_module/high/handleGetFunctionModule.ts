import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';
import { assertFunctionGroupMatches } from '../shared/parseContainerGroup';

export const TOOL_DEFINITION = {
  name: 'GetFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP function module definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).',
      },
      function_group_name: {
        type: 'string',
        description:
          'FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

interface GetFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
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

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getFunctionModule(
    resultsFor(functionModuleDocuments),
  );

  // Metadata first, exactly like `ReadFunctionModule` — this is the one
  // Get* handler that already made two calls before the migration (to
  // verify the caller-supplied group against metadata's own
  // `<adtcore:containerRef/>` before trusting a source read; ADT resolves a
  // function module by name alone regardless of the group segment in the
  // URL). `realGroup` is assigned inside the pair step that parses
  // `containerRef`, carried out through the closure so the projection below
  // can answer it without a second parse.
  let realGroup = functionGroupName;
  return answer(
    { tool: 'GetFunctionModule', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.readMetadata(
            { functionModuleName, functionGroupName },
            { analyse: analyseException },
          ),
        (metadata: AdtReading<string>) => {
          realGroup = assertFunctionGroupMatches(
            metadata.raw,
            functionGroupName,
            functionModuleName,
          );
          return obj.read(
            { functionModuleName, functionGroupName: realGroup },
            version,
            { analyse: analyseException },
          );
        },
      ),
    ([, source]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      function_module_name: functionModuleName,
      function_group_name: realGroup,
      version,
      function_module_data: source.raw,
    }),
  );
}
