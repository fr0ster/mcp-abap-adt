import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { readFunctionGroupMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetFunctionGroup',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP function group named by function_group_name in one request: its ADT metadata document (package, description, contents). Returns it under `metadata`, with `part: "metadata"`.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'FunctionGroup name.',
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
  const client = createAdtClient(connection, logger);

  // A function group is a container: it has no source of its own —
  // `IFunctionGroupContract` composes `IAdtMetadataReadable` and nothing
  // else, so unlike its siblings there is no `.read()` to call at all.
  // `version` is not forwarded — the library ignores it at every level for
  // this family — and is echoed, deliberately unfixed (task 11 fix round
  // 1, deferred to the documentation task). One call, used for the one
  // field this tool has always answered.
  return answer(
    { tool: 'GetFunctionGroup', detail: 'terse' },
    () => readFunctionGroupMetadata(client, { functionGroupName }),
    (metadata: AdtReading<string>) => ({
      success: true,
      function_group_name: functionGroupName,
      version,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
