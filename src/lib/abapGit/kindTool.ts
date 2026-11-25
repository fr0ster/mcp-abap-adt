/**
 * An abapGit tool whose arguments differ by system kind (spec §4.1, §4.6):
 * `folder_logic` is cloud's on `LinkAbapGitRepo`, `background` on-premise's
 * on link, pull and push. Each kind states its own schema, and the handler
 * takes what either one parses — so a property one kind does not declare is
 * absent from its listed schema, and typed optional in the handler.
 */

import type * as z from 'zod';
import { systemKindOf } from '../connectionFactory';
import {
  type HandlerContext,
  type HandlerEntry,
  invalidArgumentsWords,
  type SapEnvironment,
  type ToolDefinition,
} from '../handlers/interfaces';
import type { ToolResultLike } from '../toolResult';

/** One kind's description and schema. */
export interface KindDefinition<S extends z.ZodObject> {
  readonly description: string;
  readonly inputSchema: S;
}

/** A tool stated per kind: its on-premise and its cloud definition. */
export interface KindToolDefinition<
  O extends z.ZodObject,
  C extends z.ZodObject,
> {
  readonly name: string;
  /** Where no kind is stated: the on-premise description. */
  readonly description: string;
  /** Where no kind is stated: the on-premise schema. */
  readonly inputSchema: O;
  readonly available_in?: readonly SapEnvironment[];
  readonly onprem: KindDefinition<O>;
  readonly cloud: KindDefinition<C>;
}

/** The registered definition: the on-premise one where no kind is stated. */
export function kindToolDefinition<
  O extends z.ZodObject,
  C extends z.ZodObject,
>(definition: KindToolDefinition<O, C>): ToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    ...(definition.available_in !== undefined
      ? { available_in: definition.available_in }
      : {}),
    variants: {
      onprem: definition.onprem,
      cloud: definition.cloud,
    },
  };
}

/**
 * The entry of a tool stated per kind: a call is read with the schema of its
 * connection's kind (none recorded: the on-premise one), the handler given
 * what it parsed.
 */
export function defineKindTool<
  O extends z.ZodObject,
  C extends z.ZodObject,
  R extends ToolResultLike,
>(
  definition: KindToolDefinition<O, C>,
  handler: (
    context: HandlerContext,
    args: z.output<O> | z.output<C>,
  ) => Promise<R>,
): HandlerEntry<R> {
  return {
    toolDefinition: kindToolDefinition(definition),
    call: async (context, args) => {
      const parsed =
        systemKindOf(context.connection) === 'cloud'
          ? definition.cloud.inputSchema.safeParse(args)
          : definition.onprem.inputSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          invalidArgumentsWords(definition.name, parsed.error.issues),
        );
      }
      return handler(context, parsed.data);
    },
  };
}
