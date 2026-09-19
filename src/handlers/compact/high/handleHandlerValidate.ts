/**
 * Task 28: why this compact facade carries no `detail` of its own.
 *
 * Both handlers this facade delegates to genuinely reach a `detail`-bearing
 * projection: `handleValidateObject` (`common/low/handleValidateObject.ts`)
 * answers through `project(detail, terseValidation)`, and so does the
 * `SERVICE_BINDING` branch's `handleValidateServiceBinding` (fixed in this
 * same task). Neither call below forwards a `detail` argument, so both
 * siblings always answer at their default, terse — a fourth shape the
 * brief's three rows do not name: a tool with a real reading behind it,
 * reached only through another handler it delegates to.
 *
 * `handleValidateObject`'s own `TOOL_DEFINITION` (`ValidateObjectLow`) is
 * not even a registered tool — `LowLevelHandlersGroup.ts` comments its
 * registration out — so for every `object_type` except `SERVICE_BINDING`
 * this compact facade is the ONLY way a caller reaches that function's
 * logic at all. Deliberately kept off this facade's own reduced,
 * `compactValidateSchema` surface (the same simplification `compact/` tools
 * make everywhere: no `detail`, no low-level session knobs) rather than
 * exposed here for the first time.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleValidateObject } from '../../common/low/handleValidateObject';
import { handleValidateServiceBinding } from '../../service_binding/high/handleValidateServiceBinding';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactValidateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerValidate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Validate before create only. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).',
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
