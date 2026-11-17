/**
 * `HandlerSystem` (D25, DO21): the system-wide reads in one compact tool.
 * Each `action` is the call of exactly one full tool's entry, so that tool's
 * own schema parses the arguments: a missing required argument is refused in
 * its words before anything is sent, and every key it does not declare — an
 * argument of another action among them — is dropped. The action alone picks
 * the tool.
 *
 * `background` is `HandlerSystem`'s own: the server decides it at the
 * dispatch (a listed long tool), and the target's call runs inside that run
 * or that synchronous call, on its connection.
 */

import {
  handlerSystemDefinition,
  type SystemAction,
} from '@mcp-abap-adt/lib/compact-shared';
import {
  defineTool,
  type HandlerContext,
  type ToolArgs,
  type ToolResultLike,
} from '@mcp-abap-adt/lib/handlers';
import {
  handleGetATCFindings,
  handleGetATCResult,
  handleGetPackageTree,
  handleGetWhereUsed,
  handleListATCResults,
  handleListTransports,
  handleSearchObject,
  handleSearchSource,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerSystem',
  available_in: ['onprem', 'cloud'] as const,
  ...handlerSystemDefinition(),
} as const;

/** One action's target: the call of its full tool's entry. */
export type SystemTarget = (
  context: HandlerContext,
  args: ToolArgs,
) => Promise<ToolResultLike>;

const D = READ_DEFINITIONS;

/** Each action's target: its full tool's entry, whose schema parses the call. */
const SYSTEM_TARGETS = {
  search_source: defineTool(D.SearchSource, handleSearchSource).call,
  search_object: defineTool(D.SearchObject, handleSearchObject).call,
  where_used: defineTool(D.GetWhereUsed, handleGetWhereUsed).call,
  package_tree: defineTool(D.GetPackageTree, handleGetPackageTree).call,
  transports: defineTool(D.ListTransports, handleListTransports).call,
  atc_findings: defineTool(D.GetATCFindings, handleGetATCFindings).call,
  atc_results: defineTool(D.ListATCResults, handleListATCResults).call,
  atc_result: defineTool(D.GetATCResult, handleGetATCResult).call,
} as const satisfies Readonly<Record<SystemAction, SystemTarget>>;

type HandlerSystemArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The call of `args.action`'s target among `targets`, with the call's
 * arguments but `action` and `background`.
 */
export async function systemCall(
  targets: Readonly<Record<SystemAction, SystemTarget>>,
  context: HandlerContext,
  args: HandlerSystemArgs,
): Promise<ToolResultLike> {
  const { action, background: _background, ...given } = args;
  return targets[action](context, given);
}

export async function handleHandlerSystem(
  context: HandlerContext,
  args: HandlerSystemArgs,
) {
  return systemCall(SYSTEM_TARGETS, context, args);
}
