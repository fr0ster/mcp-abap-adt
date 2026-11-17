import type * as z from 'zod';
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
  PACKAGE_NAME_REQUIRED,
  SERVICE_BINDING_NAME_REQUIRED,
  SERVICE_DEFINITION_NAME_REQUIRED,
  validateObject,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerValidate',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactValidateDescription(variant),
    inputSchema: compactValidateSchemaFor(COMPACT_VALIDATE[variant]),
    members: COMPACT_VALIDATE[variant],
  })),
} as const;

type HandlerValidateArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
    // The callee's arguments require both names; an absent one is refused
    // here in the callee's words and order, as the callee refuses it, and
    // nothing is sent. An empty or blank package reaches the callee, which
    // refuses it in the same words.
    const definition = args.service_definition_name;
    const packageName = args.package_name;
    if (!args.object_name) {
      return return_error(new Error(SERVICE_BINDING_NAME_REQUIRED));
    }
    if (!definition) {
      return return_error(new Error(SERVICE_DEFINITION_NAME_REQUIRED));
    }
    if (packageName === undefined) {
      return return_error(new Error(PACKAGE_NAME_REQUIRED));
    }
    return handleValidateServiceBinding(context, {
      service_binding_name: args.object_name,
      service_definition_name: definition,
      service_binding_version: args.service_binding_version,
      package_name: packageName,
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
