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
  type CompactHandler,
  type CompactObjectType,
  dispatchCompact,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetPackageContents,
  handleGetServiceBindingPreviewUrl,
  handleReadBehaviorDefinition,
  handleReadBehaviorImplementation,
  handleReadClass,
  handleReadDataElement,
  handleReadDdl,
  handleReadDomain,
  handleReadFunctionGroup,
  handleReadFunctionModule,
  handleReadInterface,
  handleReadMetadataExtension,
  handleReadPackage,
  handleReadProgram,
  handleReadServiceBinding,
  handleReadServiceDefinition,
  handleReadStructure,
  handleReadTable,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

/** `part: 'metadata'` — the ADT metadata document, for the types that have one. */
export const compactMetadataRoutes: Partial<
  Record<CompactObjectType, CompactHandler>
> = {
  PACKAGE: handleReadPackage as unknown as CompactHandler,
  DOMAIN: handleReadDomain as unknown as CompactHandler,
  DATA_ELEMENT: handleReadDataElement as unknown as CompactHandler,
  TABLE: handleReadTable as unknown as CompactHandler,
  STRUCTURE: handleReadStructure as unknown as CompactHandler,
  DDL: handleReadDdl as unknown as CompactHandler,
  SERVICE_DEFINITION: handleReadServiceDefinition as unknown as CompactHandler,
  SERVICE_BINDING: handleReadServiceBinding as unknown as CompactHandler,
  CLASS: handleReadClass as unknown as CompactHandler,
  PROGRAM: handleReadProgram as unknown as CompactHandler,
  INTERFACE: handleReadInterface as unknown as CompactHandler,
  FUNCTION_GROUP: handleReadFunctionGroup as unknown as CompactHandler,
  FUNCTION_MODULE: handleReadFunctionModule as unknown as CompactHandler,
  BEHAVIOR_DEFINITION:
    handleReadBehaviorDefinition as unknown as CompactHandler,
  BEHAVIOR_IMPLEMENTATION:
    handleReadBehaviorImplementation as unknown as CompactHandler,
  METADATA_EXTENSION: handleReadMetadataExtension as unknown as CompactHandler,
};

/**
 * `part: 'urls'` — the service URL, its `$metadata` and the browser preview.
 *
 * One entry, and that is the honest size of it: a preview URL is a thing a service
 * binding has and other repository objects do not.
 */
export const compactUrlRoutes: Partial<
  Record<CompactObjectType, CompactHandler>
> = {
  SERVICE_BINDING:
    handleGetServiceBindingPreviewUrl as unknown as CompactHandler,
};

/**
 * `part: 'contents'` — the objects a package contains, as a flat list. A package
 * has no source, and its metadata carries its sub-packages, not its members.
 */
export const compactContentsRoutes: Partial<
  Record<CompactObjectType, CompactHandler>
> = {
  PACKAGE: packageContentsLines as unknown as CompactHandler,
};

type ContentsAnswer = {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
};

/**
 * A package's members, one per line: name, type, description — the shape a
 * search answers. The core reader answers pretty-printed JSON that repeats the
 * package's own name and the type's kind on every row; for a package with a few
 * hundred members that is tens of kilobytes carrying three facts per object.
 */
async function packageContentsLines(
  context: HandlerContext,
  args: Record<string, unknown>,
): Promise<unknown> {
  const answered = (await handleGetPackageContents(
    context,
    args as never,
  )) as ContentsAnswer;
  const text = answered?.content?.[0]?.text;
  if (answered?.isError || typeof text !== 'string') return answered;
  try {
    const items = JSON.parse(text) as Array<{
      name?: string;
      type?: string;
      description?: string;
    }>;
    if (!Array.isArray(items)) return answered;
    // Capped like a where-used list: a structure package's members are its
    // sub-packages, and on the cloud trial one had 5,813 of them.
    const max =
      typeof args.max_results === 'number' && args.max_results > 0
        ? args.max_results
        : 100;
    const lines = ['name\ttype\tdescription'];
    for (const item of items.slice(0, max)) {
      lines.push(
        `${item.name ?? ''}\t${item.type ?? ''}\t${item.description ?? ''}`,
      );
    }
    if (items.length > max) {
      lines.push(
        `(${max} of ${items.length} shown; raise max_results for more)`,
      );
    }
    return {
      ...answered,
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch {
    return answered;
  }
}

export type CompactReadPart = 'source' | 'metadata' | 'urls' | 'contents';

/** The parts a type can answer, for a refusal that tells the caller what to ask. */
export function partsFor(
  objectType: CompactObjectType,
  hasSource: boolean,
): CompactReadPart[] {
  const parts: CompactReadPart[] = [];
  if (hasSource) parts.push('source');
  if (compactMetadataRoutes[objectType]) parts.push('metadata');
  if (compactUrlRoutes[objectType]) parts.push('urls');
  if (compactContentsRoutes[objectType]) parts.push('contents');
  return parts;
}

/** Route a non-source part, or refuse naming what this type does offer. */
export async function routeCompactPart(
  context: HandlerContext,
  part: Exclude<CompactReadPart, 'source'>,
  args: { object_type: CompactObjectType } & Record<string, unknown>,
  hasSource: boolean,
): Promise<unknown> {
  const routes =
    part === 'metadata'
      ? compactMetadataRoutes
      : part === 'contents'
        ? compactContentsRoutes
        : compactUrlRoutes;
  if (routes[args.object_type] === undefined) {
    // Answered as a refusal rather than thrown, the way the router answers an
    // unsupported operation: both paths through this surface should have the same
    // shape, and a caller reads the message either way.
    const offered = partsFor(args.object_type, hasSource);
    return return_error(
      new Error(
        `part=${part} is not available for object_type=${args.object_type}. ` +
          `It offers: ${offered.length === 0 ? 'nothing' : offered.join(', ')}.`,
      ),
    );
  }
  const map = {
    [args.object_type]: { get: routes[args.object_type] },
  } as never;
  return dispatchCompact(context, map, 'get', args);
}
