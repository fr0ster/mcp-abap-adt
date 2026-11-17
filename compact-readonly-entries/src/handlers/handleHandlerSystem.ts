/**
 * `HandlerSystem` (D25, DO21): the system-wide reads in one compact tool.
 * Each `action` is the call of exactly one full tool's entry, so that tool's
 * own schema parses the arguments: a missing required argument is refused in
 * its words before anything is sent, and every key it does not declare — an
 * argument of another action among them — is dropped. The action alone picks
 * the tool.
 *
 * The same check runs before the call takes a connection
 * (`systemArgumentsRefusal`, the entry's `refusesArguments`): a missing
 * required argument is refused in the target's words with `background`
 * true or false, with or without a fresh-connection factory — no
 * connection opened, no run started, nothing sent.
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
  argumentsRefusalOf,
  defineTool,
  type HandlerContext,
  type HandlerEntry,
  invalidArgumentsWords,
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
  packageTreeArgumentsRefusal,
  READ_DEFINITIONS,
  whereUsedArgumentsRefusal,
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

/** One action's arguments refused without the call: its target's refusal. */
type SystemRefusal = (args: ToolArgs) => Error | undefined;

/**
 * Each action's refusal of its arguments, its target's own: the full
 * tool's schema, then the rules its handler checks before it reads.
 */
const SYSTEM_REFUSALS = {
  search_source: argumentsRefusalOf(D.SearchSource),
  search_object: argumentsRefusalOf(D.SearchObject),
  where_used: argumentsRefusalOf(D.GetWhereUsed, whereUsedArgumentsRefusal),
  package_tree: argumentsRefusalOf(
    D.GetPackageTree,
    packageTreeArgumentsRefusal,
  ),
  transports: argumentsRefusalOf(D.ListTransports),
  atc_findings: argumentsRefusalOf(D.GetATCFindings),
  atc_results: argumentsRefusalOf(D.ListATCResults),
  atc_result: argumentsRefusalOf(D.GetATCResult),
} as const satisfies Readonly<Record<SystemAction, SystemRefusal>>;

/**
 * The refusal a `HandlerSystem` call of `args` answers, read before the
 * call takes a connection: `HandlerSystem`'s own schema, then the action's
 * target's (`undefined`: none).
 */
export function systemArgumentsRefusal(args: ToolArgs): Error | undefined {
  const parsed = TOOL_DEFINITION.inputSchema.safeParse(args);
  if (!parsed.success) {
    return new Error(
      invalidArgumentsWords(TOOL_DEFINITION.name, parsed.error.issues),
    );
  }
  const { action, background: _background, ...given } = parsed.data;
  return SYSTEM_REFUSALS[action](given);
}

/** `HandlerSystem`'s entry: its call, and its arguments' refusal before it. */
export function handlerSystemEntry(): HandlerEntry {
  return {
    ...defineTool(TOOL_DEFINITION, handleHandlerSystem),
    refusesArguments: systemArgumentsRefusal,
  };
}

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
