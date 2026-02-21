import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleValidateServiceBinding } from '../../service_binding/high/handleValidateServiceBinding';
import { compactServiceBindingValidateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingValidate',
  description:
    'Service binding validate before create. object_type: not used. Required: service_binding_name*, service_definition_name*. Optional: service_binding_version, package_name, description. Response: JSON.',
  inputSchema: compactServiceBindingValidateSchema,
} as const;

type HandlerServiceBindingValidateArgs = {
  service_binding_name: string;
  service_definition_name: string;
  service_binding_version?: string;
  package_name?: string;
  description?: string;
};

export async function handleHandlerServiceBindingValidate(
  context: HandlerContext,
  args: HandlerServiceBindingValidateArgs,
) {
  return handleValidateServiceBinding(context, args);
}
