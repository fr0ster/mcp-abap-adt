import { compactServiceBindingValidateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleValidateServiceBinding } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingValidate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Validates a new service binding named by service_binding_name for the service definition named by service_definition_name, in the package named by package_name, before it is created; the check names the binding's package. Required: service_binding_name*, service_definition_name*, package_name* (the binding's package). Optional: service_binding_version, description. The answer is the verdict of SAP's transport check for the binding's name and package: admissible true where SAP answers S, false where it answers E, each with SAP's messages, and any other value as result; creating the binding checks the name, the package and the service definition itself. Response: JSON.",
  inputSchema: compactServiceBindingValidateSchema,
} as const;

type HandlerServiceBindingValidateArgs = {
  service_binding_name: string;
  service_definition_name: string;
  service_binding_version?: string;
  package_name: string;
  description?: string;
};

export async function handleHandlerServiceBindingValidate(
  context: HandlerContext,
  args: HandlerServiceBindingValidateArgs,
) {
  return handleValidateServiceBinding(context, args);
}
