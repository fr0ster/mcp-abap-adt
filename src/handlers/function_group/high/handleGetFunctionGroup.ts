import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionGroup',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP function group definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['function_group_name'],
  },
} as const;

interface GetFunctionGroupArgs {
  function_group_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetFunctionGroup(
  context: HandlerContext,
  args: GetFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const { function_group_name, version = 'active' } = args;
  if (!function_group_name)
    return return_error(new Error('function_group_name is required'));

  const functionGroupName = function_group_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getFunctionGroup(
    resultsFor(functionGroupDocuments),
  );

  // A function group is a container: it has no source of its own —
  // `IFunctionGroupContract` composes `IAdtMetadataReadable` and nothing
  // else, so unlike its siblings there is no `.read()` to call at all
  // (same defect/fix as `ReadFunctionGroup`). `version` is not forwarded —
  // the library ignores it at every level for this family, matching
  // `ReadFunctionGroup`'s own deliberately unfixed echo (task 11 fix round
  // 1, deferred to the documentation task). One call, used for the one
  // field this tool has always answered.
  return answer(
    { tool: 'GetFunctionGroup', detail: 'terse' },
    () =>
      obj.readMetadata({ functionGroupName }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      function_group_name: functionGroupName,
      version,
      function_group_data: metadata.raw,
    }),
  );
}
