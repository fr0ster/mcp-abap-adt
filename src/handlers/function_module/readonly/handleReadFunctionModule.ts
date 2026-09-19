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
  name: 'ReadFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: FunctionModule. Will be useful for reading, creating, or updating function module. [read-only] Read ABAP function module source code and metadata. Answers: "show function module code", "display FM source", "view function X", "get function module implementation". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FM).',
      },
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the function module (e.g., Z_MY_FG).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

export async function handleReadFunctionModule(
  context: HandlerContext,
  args: {
    function_module_name: string;
    function_group_name: string;
    version?: 'active' | 'inactive';
  },
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

  // Metadata first, not source-then-metadata like every sibling in this
  // family: the ADT backend resolves a function module by name alone
  // regardless of the group segment in the URL, so the caller-supplied group
  // must be verified from metadata's own <adtcore:containerRef/> before any
  // source read can be trusted. `pair`'s second step is handed the first
  // step's own reading for exactly this reason — `assertFunctionGroupMatches`
  // throws when the groups disagree, which `answer()` catches and reports as
  // `client_threw`, the same verdict the pre-19 handler gave for a mismatch.
  //
  // `realGroup` is assigned once, inside the pair step that already parsed
  // `containerRef` to get it, and carried out through this closure so the
  // projection below can answer it without a second parse of the same
  // document.
  let realGroup = functionGroupName;
  return answer(
    { tool: 'ReadFunctionModule', detail: 'terse' },
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
    ([metadata, source]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      function_module_name: functionModuleName,
      function_group_name: realGroup,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
