/**
 * Every tool argument whose values are projected from the ADT type tables
 * (`src/lib/adtProjections.ts`), with the projection it is given on each
 * variant: what the tool-set fixtures record and what the walk test sends.
 *
 * `argument` is a property of the input schema, or `objects[].<property>`
 * for a property of the items of `objects`. `listed` is whether the schema
 * lists the values as its enum (else its description names them).
 */
import {
  ACTIVATION_CODES,
  ACTIVATION_NAMES,
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  COMPACT_DELETION_CHECK,
  COMPACT_LOCK,
  COMPACT_PROFILE,
  COMPACT_READ,
  COMPACT_UNLOCK,
  COMPACT_UPDATE,
  COMPACT_VALIDATE,
  COMPACT_WHERE_USED,
  INCLUDES_PARENTS,
  SINGLE_ACTIVATION,
  type VariantValues,
  VERSIONED_KINDS,
  WHERE_USED_CODES,
  WHERE_USED_NAMES,
} from '../../lib/adtProjections';

export interface ProjectedArgument {
  readonly tool: string;
  readonly argument: string;
  readonly listed: boolean;
  readonly values: VariantValues;
}

const each = (
  tool: string,
  argument: string,
  listed: boolean,
  ...values: VariantValues[]
): ProjectedArgument => ({
  tool,
  argument,
  listed,
  values: {
    onprem: values.flatMap((value) => value.onprem),
    cloud: values.flatMap((value) => value.cloud),
  },
});

export const PROJECTED_ARGUMENTS: readonly ProjectedArgument[] = [
  each('HandlerCreate', 'object_type', true, COMPACT_CREATE),
  each('HandlerGet', 'object_type', true, COMPACT_READ),
  each('HandlerUpdate', 'object_type', true, COMPACT_UPDATE),
  each('HandlerDelete', 'object_type', true, COMPACT_DELETE),
  each('HandlerActivate', 'object_type', true, COMPACT_ACTIVATE),
  each('HandlerLock', 'object_type', true, COMPACT_LOCK),
  each('HandlerUnlock', 'object_type', true, COMPACT_UNLOCK),
  each('HandlerValidate', 'object_type', true, COMPACT_VALIDATE),
  each('HandlerCheckRun', 'object_type', true, COMPACT_CHECK),
  each('HandlerDeletionCheck', 'object_type', true, COMPACT_DELETION_CHECK),
  each('HandlerProfileRun', 'target_type', true, COMPACT_PROFILE),
  each('HandlerWhereUsed', 'object_type', true, COMPACT_WHERE_USED),
  each(
    'GetWhereUsed',
    'object_type',
    false,
    WHERE_USED_CODES,
    WHERE_USED_NAMES,
  ),
  each(
    'ActivateObjects',
    'objects[].type',
    false,
    ACTIVATION_CODES,
    ACTIVATION_NAMES,
  ),
  each('ActivateObjects', 'preaudit', false, SINGLE_ACTIVATION),
  each('GetIncludesList', 'object_type', true, INCLUDES_PARENTS),
  each('GetIncludesList', 'objects[].object_type', true, INCLUDES_PARENTS),
  each('GetObjectVersions', 'object_type', true, VERSIONED_KINDS),
  each('GetObjectVersionSource', 'object_type', true, VERSIONED_KINDS),
  each('GetObjectVersionDiff', 'object_type', true, VERSIONED_KINDS),
];

/** The schema of `argument` in `inputSchema` (see {@link ProjectedArgument}). */
export function argumentSchema(
  inputSchema: unknown,
  argument: string,
): unknown {
  const [top, item] = argument.split('[].');
  const property = Reflect.get(
    Object(Reflect.get(Object(inputSchema), 'properties')),
    top,
  );
  if (item === undefined) return property;
  const items = Reflect.get(Object(property), 'items');
  return Reflect.get(Object(Reflect.get(Object(items), 'properties')), item);
}
