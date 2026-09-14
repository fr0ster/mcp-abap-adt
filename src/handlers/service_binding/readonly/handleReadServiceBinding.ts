import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: ServiceBinding. Will be useful for reading, creating, or updating service binding. [read-only] Read ABAP service binding (SRVB) payload and metadata. Answers: "show service binding", "display SRVB config", "view service binding X", "get OData service binding". Returns payload, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name (e.g., ZUI_MY_BINDING).',
      },
    },
    required: ['service_binding_name'],
  },
} as const;

export async function handleReadServiceBinding(
  context: HandlerContext,
  args: { service_binding_name: string },
) {
  const { connection, logger } = context;
  const { service_binding_name } = args;
  if (!service_binding_name)
    return return_error(new Error('service_binding_name is required'));

  // The config field is `bindingName`, not `serviceBindingName` — confirmed
  // against `IServiceBindingConfig`, which the tool's own arg name does not
  // spell out. Also unlike its siblings, a binding's `read` has no `version`
  // in the tool surface, so `undefined` is passed through explicitly.
  const bindingName = service_binding_name.trim().toUpperCase();
  const obj = createAdtClient(connection, logger).getServiceBinding(
    resultsFor(serviceDocuments),
  );

  return answer(
    { tool: 'ReadServiceBinding', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ bindingName }, undefined, {
            analyse: analyseException,
          }),
        () => obj.readMetadata({ bindingName }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      service_binding_name: bindingName,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
