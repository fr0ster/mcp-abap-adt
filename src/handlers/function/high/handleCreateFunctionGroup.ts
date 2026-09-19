/**
 * CreateFunctionGroup Handler - ABAP Function Group Creation via ADT API
 *
 * Uses AdtClient.getFunctionGroup().{create,activate} from
 * @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: create -> (activate). No lock: `create` posts a metadata document
 * (name/description/package/transport) — there is no source to write for a
 * function group (a container; its modules and includes carry the source) —
 * and `activate` is its own unlocked request, so opting into it costs one
 * more round trip, never a lock.
 *
 * **`packageName` is required by the member itself, not only by this tool.**
 * `AdtFunctionGroup.create()` throws before issuing a request when
 * `config.packageName` is missing — a function group created without one
 * cannot be deleted through ADT (the deletion check resolves through the
 * package). Verified against `AdtFunctionGroup.js`.
 *
 * **The pre-migration handler's Kerberos/"Business partner" 400
 * compensations are dropped.** They masked a genuine refusal ADT never
 * softened into a 200 — the low-tier `CreateFunctionGroupLow` dropped the
 * same compensation for the same reason; see its own doc comment.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
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
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionGroup',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP function group in SAP system. Function groups serve as containers for function modules.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars).',
      },
      description: {
        type: 'string',
        description:
          'Function group description. If not provided, function_group_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate function group after creation. Default: true. Set to false for batch operations.',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'package_name'],
  },
} as const;

interface CreateFunctionGroupArgs {
  function_group_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  activate?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateFunctionGroup(
  context: HandlerContext,
  args: CreateFunctionGroupArgs,
) {
  const { connection, logger } = context;

  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateFunctionGroup', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getFunctionGroup(
        resultsFor(functionGroupDocuments),
      );

      const created = await obj.create(
        {
          functionGroupName,
          description: args.description || functionGroupName,
          packageName: args.package_name,
          transportRequest: args.transport_request,
          masterLanguage: args.master_language,
        },
        { analyse: analyseException },
      );

      if (!created.ok || !shouldActivate) {
        return created as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate(
        { functionGroupName },
        { analyse: analyseActivation },
      );
    },
    project(detail, terseWrite),
  );
}
