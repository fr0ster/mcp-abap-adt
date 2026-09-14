import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadFunctionGroup',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Read ABAP function group source code and metadata. Answers: "show function group code", "display FUGR source", "view function group X", "get function group includes". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_MY_FG).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['function_group_name'],
  },
} as const;

export async function handleReadFunctionGroup(
  context: HandlerContext,
  args: { function_group_name: string; version?: 'active' | 'inactive' },
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
  // else, so unlike its siblings in this family there is no `.read()` to
  // call at all: `read` and `readMetadata` fetched the identical document
  // even before 19. One call, used for both fields this tool has always
  // answered.
  return answer(
    { tool: 'ReadFunctionGroup', detail: 'terse' },
    () =>
      obj.readMetadata({ functionGroupName }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      function_group_name: functionGroupName,
      version,
      source_code: metadata.raw,
      metadata: metadata.raw,
    }),
  );
}
