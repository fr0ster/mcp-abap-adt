/**
 * ValidateServiceBinding Handler - Validate ABAP service binding parameters
 *
 * Uses AdtClient.getServiceBinding().validate from @mcp-abap-adt/adt-clients 19.
 *
 * **`validate()` is narrower than the removed `validateServiceBinding`, not
 * a like-for-like rename.** Its shipped body (`AdtService.js` `validate()`,
 * confirmed against the compiled source rather than only its own doc
 * comment, which still describes a variant check this body does not make)
 * calls exactly one endpoint: `transportCheckRequest` — a POST to
 * `/sap/bc/adt/cts/transportchecks`, the same generic CTS transport check
 * every other high-tier validate in this repository already uses. It reads
 * only `config.bindingName`, `config.packageName` and `config.description`;
 * `serviceDefinitionName` and `serviceVersion` — fields the removed
 * composite's own parameter names (`serviceDefinition`,
 * `serviceBindingVersion`) suggest it checked against a service-binding-
 * specific endpoint — have nowhere to go on this member, the same
 * "nowhere to go" `update()`'s own doc comment names for its own dropped
 * fields. No other member on `AdtServiceBinding` validates a name or a
 * variant, so this is the only remaining single-call candidate, kept as a
 * one-call migration (Shape 1) with that narrowing documented rather than
 * silently accepted.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Validate service binding parameters (name, service definition, package, version) via ADT validation endpoint.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name to validate.',
      },
      description: {
        type: 'string',
        description: 'Optional description used during validation.',
      },
      service_definition_name: {
        type: 'string',
        description:
          'Service definition linked to binding. Accepted for backward compatibility; the transport check this now runs does not read it.',
      },
      package_name: {
        type: 'string',
        description: 'ABAP package for the binding.',
      },
      service_binding_version: {
        type: 'string',
        description:
          'Service binding version (for example: 1.0). Accepted for backward compatibility; the transport check this now runs does not read it.',
      },
    },
    required: ['service_binding_name', 'service_definition_name'],
  },
} as const;

interface ValidateServiceBindingArgs {
  service_binding_name: string;
  description?: string;
  service_definition_name?: string;
  package_name?: string;
  service_binding_version?: string;
}

export async function handleValidateServiceBinding(
  context: HandlerContext,
  args: ValidateServiceBindingArgs,
) {
  const { connection, logger } = context;

  if (!args?.service_binding_name) {
    return return_error(new Error('service_binding_name is required'));
  }
  if (!args?.service_definition_name) {
    return return_error(new Error('service_definition_name is required'));
  }

  const bindingName = args.service_binding_name.trim().toUpperCase();

  return answer(
    { tool: 'ValidateServiceBinding', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getServiceBinding(resultsFor(serviceDocuments))
        .validate(
          {
            bindingName,
            packageName: args.package_name?.trim().toUpperCase(),
            description: args.description?.trim(),
          },
          { analyse: analyseValidation },
        ),
    project('terse', terseValidation),
  );
}
