import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleValidateObject } from '../../common/low/handleValidateObject';
import { handleValidateServiceBinding } from '../../service_binding/high/handleValidateServiceBinding';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactValidateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerValidate',
  description:
    'Compact lifecycle validate operation. Validates object names/params by object_type.',
  inputSchema: compactValidateSchema,
} as const;

type HandlerValidateArgs = {
  object_type: CompactObjectType;
  object_name: string;
  package_name?: string;
  description?: string;
  behavior_definition?: string;
  root_entity?: string;
  implementation_type?: string;
  service_definition_name?: string;
  service_binding_version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
};

export async function handleHandlerValidate(
  context: HandlerContext,
  args: HandlerValidateArgs,
) {
  if (args.object_type === 'SERVICE_BINDING') {
    return handleValidateServiceBinding(context, {
      service_binding_name: args.object_name,
      service_definition_name: args.service_definition_name,
      service_binding_version: args.service_binding_version,
      package_name: args.package_name,
      description: args.description,
    });
  }

  const lowType = toLowObjectType(args.object_type);
  if (!lowType) {
    throw new Error(
      `Validate is not supported for object_type: ${args.object_type}`,
    );
  }

  return handleValidateObject(context, {
    object_name: args.object_name,
    object_type: lowType,
    package_name: args.package_name,
    description: args.description,
    behavior_definition: args.behavior_definition,
    root_entity: args.root_entity,
    implementation_type: args.implementation_type,
    session_id: args.session_id,
    session_state: args.session_state,
  });
}
