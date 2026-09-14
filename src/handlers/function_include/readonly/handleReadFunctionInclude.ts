import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Read ABAP function group include source code and metadata. Answers: "show function group include code", "display include source", "view include of function group". Returns source code and include metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., Z_MY_FG).',
      },
      include_name: {
        type: 'string',
        description: 'Include name (e.g., LZ_MY_FGTOP, LZ_MY_FGU01).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['function_group_name', 'include_name'],
  },
} as const;

export async function handleReadFunctionInclude(
  context: HandlerContext,
  args: {
    function_group_name: string;
    include_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  const { function_group_name, include_name, version = 'active' } = args;
  if (!function_group_name || !include_name)
    return return_error(
      new Error('function_group_name and include_name are required'),
    );

  const functionGroupName = function_group_name.toUpperCase();
  const includeName = include_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getFunctionInclude(
    resultsFor(functionIncludeDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadFunctionInclude', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ functionGroupName, includeName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata(
            { functionGroupName, includeName },
            { analyse: analyseException },
          ),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      function_group_name: functionGroupName,
      include_name: includeName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
