/**
 * UpdateFunctionModule Handler - Update Existing ABAP Function Module Source Code
 *
 * Uses AdtClient.getFunctionModule().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> update -> unlock -> (activate). The pre-migration
 * handler ran a `check` between `update` and `unlock` unconditionally
 * (outside any `safeCheckOperation` swallow); it is gone here for the same
 * reason the other families in this cluster dropped theirs: it duplicated
 * what `update`'s own `analyseException` already verdicts.
 *
 * **The source goes through `options.sourceCode`.** See
 * `UpdateFunctionModuleLow`.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionModule',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update, Create. Subject: FunctionModule. Will be useful for updating or creating function module. Update source code of an existing ABAP function module. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the function module (e.g., ZOK_FG_MCP01).',
      },
      function_module_name: {
        type: 'string',
        description:
          'Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist.',
      },
      source_code: {
        type: 'string',
        description:
          'Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable function modules.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate function module after source update. Default: false. Set to true to activate immediately.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'function_module_name', 'source_code'],
  },
} as const;

interface UpdateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateFunctionModule(
  context: HandlerContext,
  args: UpdateFunctionModuleArgs,
) {
  const { connection, logger } = context;

  if (!args.function_module_name || args.function_module_name.length > 30) {
    return return_error(
      new Error(
        'Function module name is required and must not exceed 30 characters',
      ),
    );
  }
  if (!args.function_group_name || args.function_group_name.length > 30) {
    return return_error(
      new Error(
        'Function group name is required and must not exceed 30 characters',
      ),
    );
  }
  if (!args.source_code) {
    return return_error(new Error('Source code is required'));
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const functionModuleName = args.function_module_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionModule', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getFunctionModule(
        resultsFor(functionModuleDocuments),
      );

      const written = await withLock(
        () => obj.lock({ functionModuleName, functionGroupName }),
        (lockHandle) =>
          obj.update(
            {
              functionModuleName,
              functionGroupName,
              transportRequest: args.transport_request,
            },
            {
              sourceCode: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) =>
          obj.unlock({ functionModuleName, functionGroupName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate(
        { functionModuleName, functionGroupName },
        { analyse: analyseActivation },
      );
    },
    project(detail, terseWrite),
  );
}
