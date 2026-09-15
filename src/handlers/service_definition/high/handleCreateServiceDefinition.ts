/**
 * CreateServiceDefinition Handler - ABAP Service Definition Creation via ADT API
 *
 * Uses AdtClient.getServiceDefinition().{create,activate} from
 * @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: create -> (activate). No lock: `create` posts a metadata document
 * only (`AdtServiceDefinition.js`'s `create()` never reads `sourceCode`), and
 * `activate` is its own unlocked request.
 *
 * **`source_code` reaches nothing here, and did not reach the wire from the
 * pre-migration handler's own `create()` call either** — the pre-migration
 * handler wrote it with a *second*, separate `update()` call after create,
 * which held a lock internally (adt-clients 18's fat `update()`). That second
 * call is out of scope for this task: "these ten updates take the [caller's]
 * lock handle... Do not give these a lock lifecycle" applies to creates too,
 * and `update()`'s v19 shape needs one (see `UpdateServiceDefinition`,
 * already migrated with `withLock` in a prior task). A caller who passes
 * `source_code` here should call `LockServiceDefinition` +
 * `UpdateServiceDefinition` + `UnlockServiceDefinition` afterward — kept on
 * this tool's schema for compatibility, but not forwarded.
 */

import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
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
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: ServiceDefinition. Will be useful for creating service definition. Create a new ABAP service definition in SAP system. Creates the service definition object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description:
          'Service definition name (e.g., ZSD_MY_SERVICE). Must follow SAP naming conventions (start with Z or Y).',
      },
      description: {
        type: 'string',
        description:
          'Service definition description. If not provided, service_definition_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      source_code: {
        type: 'string',
        description:
          'Does not reach creation — the shipped create endpoint posts a metadata document only. Lock the object (LockServiceDefinition), then use UpdateServiceDefinition with that lock handle to write the source.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate service definition after creation. Default: true.',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['service_definition_name', 'package_name'],
  },
} as const;

interface CreateServiceDefinitionArgs {
  service_definition_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  source_code?: string;
  activate?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateServiceDefinition(
  context: HandlerContext,
  args: CreateServiceDefinitionArgs,
) {
  const { connection, logger } = context;

  if (!args?.service_definition_name) {
    return return_error(new Error('service_definition_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const serviceDefinitionName = args.service_definition_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateServiceDefinition', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getServiceDefinition(
        resultsFor(serviceDefinitionDocuments),
      );

      const created = await obj.create(
        {
          serviceDefinitionName,
          description: args.description || serviceDefinitionName,
          packageName: args.package_name.toUpperCase(),
          transportRequest: args.transport_request,
          masterLanguage: args.master_language,
        },
        { analyse: analyseException },
      );

      if (!created.ok || !shouldActivate) {
        return created as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate(
        { serviceDefinitionName },
        { analyse: analyseActivation },
      );
    },
    project(detail, terseWrite),
  );
}
