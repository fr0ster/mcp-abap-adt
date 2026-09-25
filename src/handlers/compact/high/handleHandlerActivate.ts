import type { IObjectReference } from '@mcp-abap-adt/interfaces-adt';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  handleActivateObject,
  TYPE_TO_FAMILY,
} from '../../common/low/handleActivateObject';
import {
  COMPACT_OBJECT_TYPES,
  type CompactObjectType,
} from './compactObjectTypes';
import { compactActivateSchema } from './compactSchemas';

/**
 * ADT type codes for compact types the activation map does not name, taken
 * from documents this repository has actually seen — `DEVC/K` in twenty
 * corpus documents, `SRVD/SRV`, `SRVB/SVB` and `FUGR/FF` in its handlers and
 * captures. A code nobody here has observed is not added: the point of
 * refusing is that a guess reaches SAP looking exactly like knowledge.
 */
const ADT_TYPE_BY_COMPACT_TYPE: Partial<Record<CompactObjectType, string>> = {
  PACKAGE: 'DEVC/K',
  SERVICE_DEFINITION: 'SRVD/SRV',
  SERVICE_BINDING: 'SRVB/SVB',
};

/**
 * **`FUNCTION_MODULE` is deliberately absent, and a code is not what it
 * lacks.** `FUGR/FF` is the right type, and it was in the table above until
 * this note replaced it — but a function module's ADT address is built under
 * its function GROUP, and the single-object form carries one name. Given only
 * the module's, the group activation addresses a group by that name: a
 * request for an object that does not exist, sent confidently.
 * `handleActivateObject` says the same thing in its own module comment —
 * *"`FUGR/FF` needs a group name this array does not carry"* — which is
 * exactly the sentence the map entry contradicted.
 *
 * So the translation stops here and the refusal says what does work. What
 * that is was established by CALLING the builder the activation path uses —
 * `utils/activationUtils.buildObjectUri` — rather than by reading a function
 * of the same name in `whereUsed.js`, which is a different one with a
 * different convention and cost this file two wrong recommendations:
 *
 *     name 'ZAC_FGR01|Z_AC_FM01'            → groups/zac_fgr01%7cz_ac_fm01/
 *                                             fmodules/zac_fgr01%7cz_ac_fm01
 *     name 'Z_AC_FM01', parentName 'ZAC_FGR01' → groups/zac_fgr01/
 *                                                fmodules/z_ac_fm01
 *     name 'Z_AC_FM01' alone                → groups/z_ac_fm01/fmodules/z_ac_fm01
 *
 * The middle one is the address. The last is the failure this refusal exists
 * to prevent, and note that it does not throw: a group named after the module
 * is a request SAP answers, about an object nobody meant.
 */
const NEEDS_MORE_THAN_A_NAME: Partial<Record<CompactObjectType, string>> = {
  FUNCTION_MODULE:
    'a function module is addressed under its function group, which this form does not take — use the batch form with objects[].parentName set to the group (name stays the module, type FUGR/FF), or ActivateFunctionModuleLow, which takes the group as its own argument',
};

/** What `object_type` alone can be activated as, or undefined. */
function adtTypeFor(type: CompactObjectType | undefined): string | undefined {
  if (!type) return undefined;
  const friendly = type.toLowerCase();
  if (TYPE_TO_FAMILY[friendly]) return friendly;
  return ADT_TYPE_BY_COMPACT_TYPE[type];
}

/** The types a caller may name without reaching for `object_adt_type`. */
function knownCompactTypes(): string[] {
  return COMPACT_OBJECT_TYPES.filter((type) => adtTypeFor(type) !== undefined);
}

export const TOOL_DEFINITION = {
  name: 'HandlerActivate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Activate operation. Single mode(object_name*, object_type or object_adt_type*). object_type is enough for CLASS, PROGRAM [onprem only], INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION, PACKAGE, SERVICE_DEFINITION and SERVICE_BINDING; any other type needs object_adt_type (e.g. "CLAS/OC"). FUNCTION_MODULE needs the batch mode with objects[].parentName set to its function group, because a module is addressed under the group. Batch mode(objects[].name*, objects[].type*, objects[].parentName, objects[].uri).',
  inputSchema: compactActivateSchema,
} as const;

type HandlerActivateArgs = {
  object_type?: CompactObjectType;
  object_name?: string;
  object_adt_type?: string;
  objects?: Array<IObjectReference & { uri?: string }>;
  preaudit?: boolean;
};

export async function handleHandlerActivate(
  context: HandlerContext,
  args: HandlerActivateArgs,
) {
  if (args.objects && args.objects.length > 0) {
    return handleActivateObject(context, {
      objects: args.objects,
      preaudit: args.preaudit,
    });
  }

  // `handleActivateObject`'s own type map accepts a lowercase friendly name
  // alongside the raw ADT code — 'program' next to 'prog/p' — and every one
  // of those names is a `CompactObjectType.toLowerCase()`, because both were
  // named from the same object list. So `object_type` is enough for the types
  // that map names.
  //
  // **It is not enough for the rest, and handing them on lowercased was
  // wrong.** The schema admits 25 object types and the map knows eleven
  // names; a `PACKAGE` lowercased to `package` is not an ADT type code, and
  // it reached the group-activation request as though it were. That is a
  // malformed request answered by SAP rather than an argument refused here,
  // and it is worse than the inconvenience it replaced — before, a caller
  // had to pass `object_adt_type` and therefore passed a code that worked.
  //
  // So: a friendly name the map knows goes through as before; a type this
  // repository has a MEASURED code for is translated; anything else is
  // refused, naming the field that settles it. Nothing is guessed — a code
  // invented here would be the same malformed request with more ceremony.
  if (!args.object_name) {
    throw new Error(
      'Provide either objects[] or object_name + (object_type or object_adt_type) for activation',
    );
  }

  const singleType = args.object_adt_type ?? adtTypeFor(args.object_type);

  if (!singleType) {
    const why = args.object_type
      ? NEEDS_MORE_THAN_A_NAME[args.object_type]
      : undefined;
    throw new Error(
      why
        ? `HandlerActivate cannot activate ${args.object_type} from a name alone: ${why}.`
        : args.object_type
          ? `HandlerActivate cannot turn object_type "${args.object_type}" into an ADT type code — pass object_adt_type instead (e.g. "CLAS/OC"). Known without it: ${knownCompactTypes().join(', ')}.`
          : 'Provide either objects[] or object_name + (object_type or object_adt_type) for activation',
    );
  }

  return handleActivateObject(context, {
    objects: [{ name: args.object_name, type: singleType }],
    preaudit: args.preaudit,
  });
}
