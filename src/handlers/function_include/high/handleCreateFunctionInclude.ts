/**
 * CreateFunctionInclude Handler - ABAP Function Group Include Creation via ADT API
 *
 * Uses AdtClient.getFunctionInclude().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it. `create()` reads `functionGroupName`,
 * `includeName`, `description`, `transportRequest`, `masterSystem` and
 * `responsible` — no source. Source is `UpdateFunctionInclude`'s job.
 * Verified against `AdtFunctionInclude.js`.
 */

import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionInclude',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: FunctionInclude. Will be useful for creating function group include. Create a new ABAP include within an existing function group. Creates the include in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Parent function group name (e.g., ZTEST_FG_001)',
      },
      include_name: {
        type: 'string',
        description: 'Include name (e.g., LZTEST_FG_001F01).',
      },
      description: {
        type: 'string',
        description: 'Optional description for the include',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'include_name'],
  },
} as const;

interface CreateFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  description?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateFunctionInclude(
  context: HandlerContext,
  args: CreateFunctionIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  if (!args?.include_name) {
    return return_error(new Error('include_name is required'));
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const includeName = args.include_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateFunctionInclude', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionInclude(resultsFor(functionIncludeDocuments))
        .create(
          {
            functionGroupName,
            includeName,
            description: args.description || includeName,
            transportRequest: args.transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
