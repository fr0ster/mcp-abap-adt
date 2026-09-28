/**
 * What a compact route is, and how one is dispatched — with no route in sight.
 *
 * The compact facade is a router: `object_type` plus an operation selects a
 * high-tier handler and the arguments pass straight through. The routes
 * themselves live in two modules, `compactReadRoutes` and `compactWriteRoutes`,
 * because a read-only tool list must be assemblable without a write handler
 * anywhere in its module graph — capability decided by what is imported, not by a
 * flag a caller could pass. This module holds what both halves need: the handler
 * shape, the map shape, and the dispatch. It imports no handler, so importing it
 * pulls nothing either half would not have pulled anyway.
 */
import type { HandlerContext } from '../../handlers/interfaces';
import { return_error } from '../utils';
import type { CompactCrudOperation } from './compactMatrix';
import type { CompactObjectType } from './compactObjectTypes';

export type CompactHandler = (
  context: HandlerContext,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type CompactRouterMap = Record<
  CompactObjectType,
  Partial<Record<CompactCrudOperation, CompactHandler>>
>;

/**
 * Pick the handler for this object type and operation, or answer why not.
 *
 * Both halves dispatch through here, so "no `object_type`" and "this type does
 * not do that" read the same whichever half the caller reached — and a read-only
 * surface answers `Unsupported update for object_type: …` rather than routing a
 * write it does not carry.
 */
export async function dispatchCompact(
  context: HandlerContext,
  routes: CompactRouterMap,
  operation: CompactCrudOperation,
  args: { object_type: CompactObjectType } & Record<string, unknown>,
): Promise<unknown> {
  context.logger?.info?.(
    `[compact-router] route operation=${operation} object_type=${args?.object_type ?? 'undefined'}`,
  );

  if (!args?.object_type) {
    context.logger?.warn?.(
      `[compact-router] object_type is required for operation=${operation}`,
    );
    return return_error(new Error('object_type is required'));
  }

  const handler = routes[args.object_type]?.[operation];
  if (!handler) {
    context.logger?.warn?.(
      `[compact-router] unsupported operation=${operation} object_type=${args.object_type}`,
    );
    return return_error(
      new Error(
        `Unsupported ${operation} for object_type: ${args.object_type}`,
      ),
    );
  }

  return handler(context, args);
}
