/**
 * CreateServiceBinding Handler - Create ABAP Service Binding, then activate
 * and generate its service
 *
 * Uses AdtClient.getServiceBinding().{create,activate,generateServiceBinding}
 * from @mcp-abap-adt/adt-clients 19.
 *
 * **The pre-migration handler's `create()` was already a composite the .d.ts
 * comment still half-describes and the shipped `.js` no longer is.**
 * `AdtServiceBinding.create()`'s doc comment says "Create the binding, and
 * activate and generate its service... What the chain does after it — the
 * check, the activation, the generation — is this implementation's business
 * and reaches a caller only if it fails" — but `AdtService.js`'s `create()`
 * body (around line 226) issues exactly one request, `createRequest`, and
 * nothing else. The comment is stale against the compiled behaviour; the
 * compiled behaviour is what this handler is built against. `create()` now
 * posts the shell only, matching the general v19 rule ("one member, one
 * endpoint call") and this repository's own create/update split.
 *
 * The pre-migration composite's three captured results —
 * `state.createResult`, `state.readResult`, `state.generatedInfoResult` —
 * are rebuilt as a sequence: `create()`, then, only when `activate` is
 * requested (as `activateOnCreate` used to gate it), `activate()` and
 * `generateServiceBinding()`. `generateServiceBinding` accepts no
 * `options.analyse` at all (confirmed against its declared signature and its
 * one-request `generateRequest` body) — its verdict is the library's
 * unjudged HTTP-status default, the same absence `classifyServiceBinding`
 * and the node-structure members in this migration share.
 *
 * **Assumption, not corpus-verified:** no captured fixture in
 * `tests/fixtures/adt/` covers a service-binding create, so the order
 * "activate before generate" follows ADT's general rule that only an active
 * object's OData service can be generated, not a recorded trace. Flagged
 * here for verification against a real system rather than asserted as fact.
 *
 * **No rollback, and the reason is the system, not a preference.** The
 * pre-19 chain deleted the half-created binding when a later step failed,
 * and whether to reproduce that was left open through this migration. It is
 * settled: there is none, because in ABAP there is nothing here to roll back
 * to. Rollback is an SQL and LUW concept — it undoes *data* changes inside a
 * unit of work, and repository object operations over ADT are not one.
 * Deleting an object that was created is not an undo: it is a second
 * operation, with its own request, its own refusal and its own outcome, and
 * calling it a rollback hides that.
 *
 * So each step answers for itself. A failed `create()` leaves nothing
 * behind — the object was never made, and there is nothing to undo. A failed
 * activate or generate leaves a binding that exists and is not yet usable,
 * which is a fact the caller gets: the answer is the failing step's own,
 * naming which step it was, so they can activate it, generate it, delete it,
 * or leave it. Deleting it here would discard a created object on a verdict
 * the caller never saw, and an activation ADT declined is not evidence that
 * the binding is unwanted.
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
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import type { ServiceBindingResponseFormat } from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'CreateServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: ServiceBinding. Will be useful for creating service binding. Create a new ABAP service binding in SAP system. Creates the service binding object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      service_definition_name: {
        type: 'string',
        description: 'Referenced service definition name.',
      },
      package_name: {
        type: 'string',
        description: 'ABAP package name.',
      },
      description: {
        type: 'string',
        description:
          'Optional description. Defaults to service_binding_name when omitted.',
      },
      binding_variant: {
        type: 'string',
        enum: [
          'ODATA_V2_UI',
          'ODATA_V2_WEB_API',
          'ODATA_V4_UI',
          'ODATA_V4_WEB_API',
        ],
        description:
          'Service binding variant. ODATA_V4_UI = OData V4 for Fiori Elements, ODATA_V4_WEB_API = OData V4 Web API, ODATA_V2_UI = OData V2 for Fiori Elements, ODATA_V2_WEB_API = OData V2 Web API.',
        default: 'ODATA_V4_UI',
      },
      service_name: {
        type: 'string',
        description:
          'Published service name. Default: service_binding_name if omitted.',
      },
      service_version: {
        type: 'string',
        description: 'Published service version. Default: 0001.',
      },
      transport_request: {
        type: 'string',
        description:
          'Optional transport request for transport checks. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate and generate the service binding after create. Default: true.',
        default: true,
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
        description:
          'Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: [
      'service_binding_name',
      'service_definition_name',
      'package_name',
    ],
  },
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

      const created = await obj.create(
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
        { analyse: analyseException },
      );

      if (!created.ok || !shouldActivate) {
        return created as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      const activated = await obj.activate(
        { bindingName: serviceBindingName },
        { analyse: analyseActivation },
      );
      if (!activated.ok) {
        return activated as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      const generated = await obj.generateServiceBinding({
        serviceType,
        bindingName: serviceBindingName,
        serviceName,
        serviceVersion,
        serviceDefinitionName,
      });
      if (!generated.ok) {
        return generated as unknown as IAdtResponse<
          AdtReading<unknown>,
          IAdtError
        >;
      }

      // **The answer is the create's own.** `AdtServiceBinding.create()`'s
      // own doc comment: "The answer is the create's own. What the chain
      // does after it — the check, the activation, the generation — is
      // this implementation's business and reaches a caller only if it
      // fails." That sentence describes a chain the compiled `create()` no
      // longer runs internally (see this file's header), but the RULE it
      // states is still the one this handler's own composed chain follows:
      // a create+activate+generate that all succeed report the create's
      // answer, not generate's — generate's own document (a service group
      // read, not a write) reaches the caller only through a refusal.
      return created as IAdtResponse<AdtReading<unknown>, IAdtError>;
    },
    project(detail, terseWrite),
  );
}
