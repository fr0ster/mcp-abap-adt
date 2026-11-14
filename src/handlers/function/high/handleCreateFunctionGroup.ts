import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
  readExceptionRefusal,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { hasT100Key, type T100Key } from '../../../lib/messageKeys';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import type { XmlRead } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionGroup',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP function group in SAP system. Function groups serve as containers for function modules.',
  inputSchema: createArguments('CreateFunctionGroup', {
    function_group_name: z
      .string()
      .describe('Function group name. Up to 26 characters.'),
    description: z
      .string()
      .optional()
      .describe(
        'Function group description. If not provided, function_group_name will be used.',
      ),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    activate: z
      .boolean()
      .optional()
      .describe(
        'Activate function group after creation. Default: true. Set to false for batch operations.',
      ),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateFunctionGroupArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
    async (): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getFunctionGroup(
        resultsFor(functionGroupDocuments),
      );

      let created: IAdtResponse<AdtReading<XmlRead>, IAdtError> = await atStep(
        'create',
        () =>
          withAdtHeaders(context, 'functionGroup.create', (headers) =>
            obj.create(
              {
                functionGroupName,
                description: args.description || functionGroupName,
                packageName: args.package_name,
                transportRequest: args.transport_request,
                masterLanguage: args.master_language,
              },
              { headers, analyse: analyseException },
            ),
          ),
      )();

      // SAP's one refusal that can accompany a create that landed: the
      // generated interface include was not created. Read the group back; if
      // it is there, the create landed.
      if (!created.ok && isInterfaceNotCreated(created.getError())) {
        logger?.warn(
          `CreateFunctionGroup answered the interface 400 for ${functionGroupName}; reading it back to see whether it exists`,
        );
        const readBack = await obj.readMetadata(
          { functionGroupName },
          { version: 'workingArea', analyse: analyseException },
        );
        if (readBack.ok) {
          logger?.info(
            `CreateFunctionGroup: ${functionGroupName} reads back, so the create landed`,
          );
          created = readBack;
        }
      }

      if (!created.ok || !shouldActivate) {
        return created;
      }

      return atStep('activate', () =>
        withAdtHeaders(context, 'functionGroup.activate', (headers) =>
          obj.activate(
            { functionGroupName },
            { headers, analyse: analyseActivation },
          ),
        ),
      )();
    },
    project(detail, terseWrite),
  );
}

/**
 * ADT's one refusal that can accompany a successful create: the generated
 * interface include was not created, "Interface SAPL<group> has not been
 * created" (`400`).
 *
 * Recognised by its T100 key, whatever the logon language words it: the
 * status is `400` for a dozen unrelated reasons and the `exc:exception` type
 * is the generic one. T100 holds this message under two keys of class `EC`,
 * `304` and `408` (on premise, 2026-11-05); either is this refusal.
 */
const INTERFACE_NOT_CREATED_KEYS: readonly T100Key[] = [
  { id: 'EC', no: '304' },
  { id: 'EC', no: '408' },
];

function isInterfaceNotCreated(error: IAdtError): boolean {
  const refusal = readExceptionRefusal(error.response?.data);
  return (
    refusal?.messages.some((message) =>
      hasT100Key(message, INTERFACE_NOT_CREATED_KEYS),
    ) ?? false
  );
}
