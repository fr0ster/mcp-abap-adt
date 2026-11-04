import * as z from 'zod';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateServiceBinding Handler - Create an ABAP service binding; when asked,
 * activate it and read the service group it publishes.
 *
 * Uses AdtClient.getServiceBinding().{create, activate, getServiceGroup}
 * from @mcp-abap-adt/adt-clients 27.
 *
 * **`create()` is one request.** It posts the binding and nothing else; until
 * adt-clients 27 its doc comment still described a create-activate-generate
 * chain the compiled member had stopped running. This handler composes the
 * rest: `create()`, then — unless `activate` is `false` — `activate()` and a
 * read of the service group.
 *
 * **The last step reads, it does not generate.** It was
 * `generateServiceBinding()` until adt-clients 27, which sent the very `GET`
 * of the service group that `getServiceGroup()` sends and generated nothing;
 * 27 removed that name. The read stays because it is a useful check after an
 * activation: a binding whose service group cannot be read is reported as the
 * refusal it is, rather than as a success.
 *
 * **No rollback, and the reason is the system, not a preference.** Rollback is
 * an SQL and LUW concept; repository object operations over ADT are not one.
 * Deleting an object that was created is a second operation with its own
 * outcome, not an undo. So each step answers for itself: a failed `create()`
 * leaves nothing behind, and a failed activation or read leaves a binding that
 * exists and is not yet usable — the answer is that step's own, naming it, so
 * the caller can activate it, delete it, or leave it.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import {
  type IAdtError,
  type IAdtResponse,
  SERVICE_BINDING_VARIANT_MAP,
  type ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import type { ServiceBindingResponseFormat } from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'CreateServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create an OData service binding (V2 or V4, UI or Web API) for a service definition, in initial state.',
  inputSchema: z.object({
    service_binding_name: z.string().describe('Service binding name.'),
    service_definition_name: z
      .string()
      .describe('Referenced service definition name.'),
    package_name: z.string().describe('ABAP package name.'),
    description: z
      .string()
      .optional()
      .describe(
        'Optional description. Defaults to service_binding_name when omitted.',
      ),
    binding_variant: z
      .enum([
        'ODATA_V2_UI',
        'ODATA_V2_WEB_API',
        'ODATA_V4_UI',
        'ODATA_V4_WEB_API',
      ])
      .default('ODATA_V4_UI')
      .optional()
      .describe(
        'Service binding variant. ODATA_V4_UI = OData V4 for Fiori Elements, ODATA_V4_WEB_API = OData V4 Web API, ODATA_V2_UI = OData V2 for Fiori Elements, ODATA_V2_WEB_API = OData V2 Web API.',
      ),
    service_name: z
      .string()
      .optional()
      .describe(
        'Published service name. Default: service_binding_name if omitted.',
      ),
    service_version: z
      .string()
      .optional()
      .describe('Published service version. Default: 0001.'),
    transport_request: z
      .string()
      .optional()
      .describe('Optional transport request for transport checks.'),
    activate: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        'Activate the service binding after create, then read its service group. Default: true.',
      ),
    response_format: z
      .enum(['xml', 'json', 'plain'])
      .default('xml')
      .optional()
      .describe(
        'Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.',
      ),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

interface CreateServiceBindingArgs {
  service_binding_name: string;
  service_definition_name: string;
  package_name: string;
  description?: string;
  binding_variant?: ServiceBindingVariant;
  service_name?: string;
  service_version?: string;
  transport_request?: string;
  activate?: boolean;
  response_format?: ServiceBindingResponseFormat;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateServiceBinding(
  context: HandlerContext,
  args: CreateServiceBindingArgs,
) {
  const { connection, logger } = context;

  if (!args?.service_binding_name) {
    return return_error(new Error('service_binding_name is required'));
  }
  if (!args?.service_definition_name) {
    return return_error(new Error('service_definition_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  const serviceBindingName = args.service_binding_name.trim().toUpperCase();
  const serviceDefinitionName = args.service_definition_name
    .trim()
    .toUpperCase();
  const packageName = args.package_name.trim().toUpperCase();
  const bindingVariant: ServiceBindingVariant =
    args.binding_variant ?? 'ODATA_V4_UI';
  const { serviceType } = SERVICE_BINDING_VARIANT_MAP[bindingVariant];
  const serviceName = (args.service_name || serviceBindingName)
    .trim()
    .toUpperCase();
  const serviceVersion = (args.service_version || '0001').trim();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateServiceBinding', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getServiceBinding(
        resultsFor(serviceDocuments),
      );

      const created = await atStep('create', () =>
        withAdtHeaders(context, 'serviceBinding.create', (headers) =>
          obj.create(
            {
              bindingName: serviceBindingName,
              packageName,
              description: (args.description || serviceBindingName).trim(),
              serviceDefinitionName,
              serviceName,
              serviceVersion,
              bindingVariant,
              transportRequest: args.transport_request,
              masterLanguage: args.master_language,
            },
            { headers, analyse: analyseException },
          ),
        ),
      )();

      if (!created.ok || !shouldActivate) {
        return created;
      }

      const activated = await atStep('activate', () =>
        withAdtHeaders(context, 'serviceBinding.activate', (headers) =>
          obj.activate(
            { bindingName: serviceBindingName },
            { headers, analyse: analyseActivation },
          ),
        ),
      )();
      if (!activated.ok) {
        return activated;
      }

      const group = await atStep('read service group', () =>
        obj.getServiceGroup(
          {
            objectname: serviceBindingName,
            serviceType,
            servicename: serviceName,
            serviceversion: serviceVersion,
            srvdname: serviceDefinitionName,
          },
          { analyse: analyseException },
        ),
      )();
      if (!group.ok) {
        return group;
      }

      // **The answer is the create's own.** A create, activation and read
      // that all succeed report the create's answer: the service group's
      // document reaches the caller only through a refusal.
      return created;
    },
    project(detail, terseWrite),
  );
}
