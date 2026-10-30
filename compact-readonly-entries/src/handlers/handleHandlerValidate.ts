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
 * not a registered tool — and since 19.0.0 no low set is served at all —
 * so for every `object_type` except `SERVICE_BINDING`
 * this compact facade is the ONLY way a caller reaches that function's
 * logic at all. Deliberately kept off this facade's own reduced,
 * `compactValidateSchema` surface (the same simplification `compact/` tools
 * make everywhere: no `detail`, no low-level session knobs) rather than
 * exposed here for the first time.
 */

import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_VALIDATE,
  COMPACT_VALIDATE_KINDS,
  compactValidateDescription,
  compactValidateSchemaFor,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import {
  handleValidateServiceBinding,
  validateObject,
} from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerValidate',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactValidateDescription(variant),
    inputSchema: compactValidateSchemaFor(COMPACT_VALIDATE[variant]),
  })),
} as const;

type HandlerValidateArgs = {
  object_type: string;
  object_name: string;
  package_name?: string;
  description?: string;
  super_package?: string;
  superclass?: string;
  behavior_definition?: string;
  root_entity?: string;
  implementation_type?: string;
  service_definition_name?: string;
  service_binding_version?: string;
};

export async function handleHandlerValidate(
  context: HandlerContext,
  args: HandlerValidateArgs,
) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_VALIDATE`); past it, the kind is typed
  // (`COMPACT_VALIDATE_KINDS`).
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_VALIDATE[variant]);
  if (member === undefined) {
    throw new Error(
      `Validate is not supported for object_type: ${args.object_type}. ${supported(COMPACT_VALIDATE[variant])}`,
    );
  }

  if (member === 'SERVICE_BINDING') {
    return handleValidateServiceBinding(context, {
      service_binding_name: args.object_name,
      service_definition_name: args.service_definition_name,
      service_binding_version: args.service_binding_version,
      package_name: args.package_name,
      description: args.description,
    });
  }

  return validateObject(context, {
    object_name: args.object_name,
    object_type: COMPACT_VALIDATE_KINDS[member],
    package_name: args.package_name,
    description: args.description,
    super_package: args.super_package,
    superclass: args.superclass,
    behavior_definition: args.behavior_definition,
    root_entity: args.root_entity,
    implementation_type: args.implementation_type,
  });
}
