/**
 * The other two aspects a compact read can answer: the metadata document and the
 * URLs.
 *
 * **Why they are routes and not tools.** Compact decomposes by OPERATION, so a read
 * that can answer the source, the ADT metadata or the service URLs is one tool with
 * a `part`, not three. And `part` belongs here rather than in the object-oriented
 * tiers' shape because it is the same read either way — what differs is which
 * document the answer carries.
 *
 * **A part an object does not have is refused by name.** Falling back to the source
 * would answer something other than what was asked and look like success; naming the
 * parts the type does offer is what lets the caller correct itself in one step.
 * Which is why these are two separate maps: what is absent from them is the answer.
 */
import {
  COMPACT_MAIN_PROGRAMS,
  type CompactHandler,
  type CompactObjectType,
  dispatchCompact,
  HANDLER_GET_DRAFT_TYPES,
  isJsonObject,
  isList,
  type JsonValue,
  jsonAt,
  jsonOf,
} from '@mcp-abap-adt/lib/compact-shared';
import type { ToolResultLike } from '@mcp-abap-adt/lib/handlers';
import {
  defineTool,
  type HandlerContext,
  type ToolArgs,
  variantOf,
} from '@mcp-abap-adt/lib/handlers';
import {
  handleGetObjectDraft,
  handleGetPackageContents,
  handleGetServiceBindingPreviewUrl,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';
import {
  compactReadRouterMap,
  readIncludePart,
  readMainPrograms,
  readTableType,
  compactSourceRoutes as route,
} from './compactReadRoutes';

/**
 * The metadata routes: the same target entries as the source reads, each
 * given `part` metadata by the read (`handleHandlerGet` passes it on).
 */
export const compactMetadataRoutes: Partial<
  Record<CompactObjectType, CompactHandler>
> = {
  PACKAGE: route.PACKAGE,
  DOMAIN: route.DOMAIN,
  DATA_ELEMENT: route.DATA_ELEMENT,
  TABLE: route.TABLE,
  STRUCTURE: route.STRUCTURE,
  TABLE_TYPE: readTableType,
  DDL: route.DDL,
  SERVICE_DEFINITION: route.SERVICE_DEFINITION,
  SERVICE_BINDING: route.SERVICE_BINDING,
  CLASS: route.CLASS,
  PROGRAM: route.PROGRAM,
  INCLUDE: readIncludePart('metadata'),
  INTERFACE: route.INTERFACE,
  FUNCTION_GROUP: route.FUNCTION_GROUP,
  FUNCTION_MODULE: route.FUNCTION_MODULE,
  BEHAVIOR_DEFINITION: route.BEHAVIOR_DEFINITION,
  BEHAVIOR_IMPLEMENTATION: route.BEHAVIOR_IMPLEMENTATION,
  METADATA_EXTENSION: route.METADATA_EXTENSION,
};

export const compactUrlRoutes: Partial<
  Record<CompactObjectType, CompactHandler>
> = {
  SERVICE_BINDING: defineTool(
    READ_DEFINITIONS.GetServiceBindingPreviewUrl,
    handleGetServiceBindingPreviewUrl,
  ).call,
};

/** GetPackageContents' entry: the contents part reads through it. */
const packageContents = defineTool(
  READ_DEFINITIONS.GetPackageContents,
  handleGetPackageContents,
).call;

export const compactContentsRoutes: Partial<
  Record<CompactObjectType, CompactHandler>
> = {
  PACKAGE: packageContentsLines,
};

/** A member's field as its listing line shows it: `''` when absent. */
function fieldOf(item: JsonValue, name: string): string {
  return String(jsonAt(item, name) ?? '');
}

/**
 * A package's members, one per line: name, type, description — the shape a
 * search answers — capped at `max`. The core reader answers pretty-printed
 * JSON that repeats the package's own name and the type's kind on every row;
 * for a package with a few hundred members that is tens of kilobytes
 * carrying three facts per object.
 */
function contentsLines(items: readonly JsonValue[], max: number): string {
  const lines = ['name\ttype\tdescription'];
  for (const item of items.slice(0, max)) {
    lines.push(
      `${fieldOf(item, 'name')}\t${fieldOf(item, 'type')}\t${fieldOf(item, 'description')}`,
    );
  }
  if (items.length > max) {
    lines.push(`(${max} of ${items.length} shown; raise max_results for more)`);
  }
  return lines.join('\n');
}

/**
 * The members as lines: for `package_name`, one listing; for
 * `package_names`, one entry per package, in the order given —
 * `{ package_name, contents }` with its listing, or `{ package_name, error }`.
 */
async function packageContentsLines(
  context: HandlerContext,
  args: ToolArgs,
): Promise<ToolResultLike> {
  const answered = await packageContents(context, args);
  const text = answered.content[0]?.text;
  if (answered.isError || typeof text !== 'string') return answered;
  // Capped like a where-used list: a structure package's members are its
  // sub-packages, and on the cloud trial one had 5,813 of them.
  const max =
    typeof args.max_results === 'number' && args.max_results > 0
      ? args.max_results
      : 100;
  const parsed = jsonOf(text);
  if (!Array.isArray(parsed)) return answered;
  const listed = isList(args.package_names)
    ? JSON.stringify(
        parsed.map((entry) => {
          const objects = jsonAt(entry, 'objects');
          return isJsonObject(entry) && Array.isArray(objects)
            ? {
                package_name: entry.package_name,
                contents: contentsLines(objects, max),
              }
            : entry;
        }),
        null,
        2,
      )
    : contentsLines(parsed, max);
  return {
    ...answered,
    content: [{ type: 'text', text: listed }],
  };
}

/** A system type of `COMPACT_MAIN_PROGRAMS`. */
type MainProgramsVariant = keyof typeof COMPACT_MAIN_PROGRAMS;

/**
 * `part: 'main_programs'` — an include's main programs (`GetMainPrograms`), on
 * the system types whose `COMPACT_MAIN_PROGRAMS` lists the member: the same
 * table the schema offers the part from.
 */
export function compactMainProgramsRoutes(
  variant: MainProgramsVariant,
): Partial<Record<CompactObjectType, CompactHandler>> {
  const routes: Partial<Record<CompactObjectType, CompactHandler>> = {};
  for (const member of COMPACT_MAIN_PROGRAMS[variant]) {
    routes[member] = readMainPrograms;
  }
  return routes;
}

/** The argument that names the object, per type the draft part reads. */
const DRAFT_NAME_ARGUMENT: ReadonlyMap<string, string> = new Map(
  Object.entries({
    PROGRAM: 'program_name',
    INCLUDE: 'include_name',
    INTERFACE: 'interface_name',
    CLASS: 'class_name',
    BEHAVIOR_IMPLEMENTATION: 'behavior_implementation_name',
    FUNCTION_MODULE: 'function_module_name',
    FUNCTION_GROUP: 'function_group_name',
    DDL: 'ddl_name',
    BEHAVIOR_DEFINITION: 'behavior_definition_name',
    METADATA_EXTENSION: 'metadata_extension_name',
    SERVICE_DEFINITION: 'service_definition_name',
    TABLE: 'table_name',
    STRUCTURE: 'structure_name',
    DOMAIN: 'domain_name',
    DATA_ELEMENT: 'data_element_name',
    TABLE_TYPE: 'table_type_name',
  } satisfies Partial<Record<CompactObjectType, string>>),
);

const objectDraft = defineTool(
  READ_DEFINITIONS.GetObjectDraft,
  handleGetObjectDraft,
).call;

/** `part: 'draft'`: the object's draft, read as the full set's draft tool reads it. */
const readDraft: CompactHandler = (context, args) => {
  const type = args.object_type;
  const argument =
    typeof type === 'string' ? DRAFT_NAME_ARGUMENT.get(type) : undefined;
  const name = argument === undefined ? undefined : args[argument];
  return objectDraft(context, {
    object_type: type,
    object_name: name,
    ...(type === 'FUNCTION_MODULE'
      ? { function_group_name: args.function_group_name }
      : {}),
  });
};

/** `part: 'draft'`, on the members the draft part reads on `variant`. */
export function compactDraftRoutes(
  variant: MainProgramsVariant,
): Partial<Record<CompactObjectType, CompactHandler>> {
  const routes: Partial<Record<CompactObjectType, CompactHandler>> = {};
  for (const member of HANDLER_GET_DRAFT_TYPES[variant]) {
    routes[member] = readDraft;
  }
  return routes;
}

export type CompactReadPart =
  | 'source'
  | 'metadata'
  | 'urls'
  | 'contents'
  | 'main_programs'
  | 'draft';

/**
 * The types with a metadata document and no source: their `Get<Type>` reads
 * that document, so `part: 'source'` has nothing to answer.
 */
const SOURCELESS: ReadonlySet<CompactObjectType> = new Set<CompactObjectType>([
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'FUNCTION_GROUP',
  'TABLE_TYPE',
]);

/** Whether `part: 'source'` reads something for this type. */
export function hasSourcePart(objectType: CompactObjectType): boolean {
  return (
    compactReadRouterMap[objectType]?.get !== undefined &&
    !SOURCELESS.has(objectType)
  );
}

/** The parts a type can answer, for a refusal that tells the caller what to ask. */
export function partsFor(
  objectType: CompactObjectType,
  hasSource: boolean,
  variant: MainProgramsVariant,
): CompactReadPart[] {
  const parts: CompactReadPart[] = [];
  if (hasSource) parts.push('source');
  if (compactMetadataRoutes[objectType]) parts.push('metadata');
  if (compactUrlRoutes[objectType]) parts.push('urls');
  if (compactContentsRoutes[objectType]) parts.push('contents');
  if (compactMainProgramsRoutes(variant)[objectType]) {
    parts.push('main_programs');
  }
  if (compactDraftRoutes(variant)[objectType]) parts.push('draft');
  return parts;
}

/** Route a non-source part, or refuse naming what this type does offer. */
export async function routeCompactPart(
  context: HandlerContext,
  part: Exclude<CompactReadPart, 'source'>,
  args: { readonly object_type: CompactObjectType } & ToolArgs,
  hasSource: boolean,
): Promise<ToolResultLike> {
  const variant = variantOf(context.connection);
  const routes =
    part === 'metadata'
      ? compactMetadataRoutes
      : part === 'contents'
        ? compactContentsRoutes
        : part === 'main_programs'
          ? compactMainProgramsRoutes(variant)
          : part === 'draft'
            ? compactDraftRoutes(variant)
            : compactUrlRoutes;
  const routed = routes[args.object_type];
  if (routed === undefined) {
    // Answered as a refusal rather than thrown, the way the router answers an
    // unsupported operation: both paths through this surface should have the same
    // shape, and a caller reads the message either way.
    const offered = partsFor(args.object_type, hasSource, variant);
    return return_error(
      new Error(
        `part=${part} is not available for object_type=${args.object_type}. ` +
          `It offers: ${offered.length === 0 ? 'nothing' : offered.join(', ')}.`,
      ),
    );
  }
  return dispatchCompact(
    context,
    { [args.object_type]: { get: routed } },
    'get',
    args,
  );
}
