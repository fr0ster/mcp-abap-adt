/**
 * CreateServiceDefinition Handler - ABAP Service Definition Creation via ADT API
 *
 * Uses AdtClient.getServiceDefinition().{create,lock,update,unlock,activate}
 * from @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: create -> (write the body, under a lock, iff source_code is
 * given) -> (activate). `create` posts a metadata document only —
 * `AdtServiceDefinition.js`'s `create()` never reads `sourceCode` — so a
 * caller who passed `source_code` and got only the shell back would have an
 * object created and activated empty. This repository has fixed that exact
 * bug once already (`project_create_shell_update_writes_body`: "create()=
 * shell/initial-state only, update() writes body; a CreateX handler taking
 * `source_code` MUST call update() after create()"); the fix round 1 excuse
 * for dropping the write here — that a lock lifecycle was out of this
 * task's scope — is contradicted by this very file's siblings
 * (`UpdateLocalTestClass` and seven others), which take exactly that
 * lifecycle through the same accessor's own `lock`/`unlock`.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode` — `config.sourceCode` belongs to `check`
 * alone. Verified against `AdtServiceDefinition.js`.
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
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
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
          'Service definition source code (optional). If not provided, a minimal template will be created.',
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

      if (!created.ok) {
        return created as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      // The shell was created empty. Write the body, under a lock this call
      // also releases, before any activation — an activated empty object is
      // the bug this write exists to avoid.
      let written = created as IAdtResponse<AdtReading<unknown>, IAdtError>;
      if (args.source_code) {
        written = await withLock(
          () => obj.lock({ serviceDefinitionName }),
          (lockHandle) =>
            obj.update(
              {
                serviceDefinitionName,
                transportRequest: args.transport_request,
              },
              {
                sourceCode: args.source_code,
                lockHandle,
                analyse: analyseException,
              },
            ),
          (lockHandle) => obj.unlock({ serviceDefinitionName }, lockHandle),
        );
      }

      if (!written.ok || !shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        await obj.activate(
          { serviceDefinitionName },
          { analyse: analyseActivation },
        ),
      );
    },
    project(detail, terseWrite),
  );
}
