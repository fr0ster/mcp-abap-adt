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

export type CompactReadPart = 'source' | 'metadata' | 'urls';

/** The parts a type can answer, for a refusal that tells the caller what to ask. */
export function partsFor(
  objectType: CompactObjectType,
  hasSource: boolean,
): CompactReadPart[] {
  const parts: CompactReadPart[] = [];
  if (hasSource) parts.push('source');
  if (compactMetadataRoutes[objectType]) parts.push('metadata');
  if (compactUrlRoutes[objectType]) parts.push('urls');
  return parts;
}

/** Route a non-source part, or refuse naming what this type does offer. */
export async function routeCompactPart(
  context: HandlerContext,
  part: Exclude<CompactReadPart, 'source'>,
  args: { object_type: CompactObjectType } & Record<string, unknown>,
  hasSource: boolean,
): Promise<unknown> {
  const routes = part === 'metadata' ? compactMetadataRoutes : compactUrlRoutes;
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
