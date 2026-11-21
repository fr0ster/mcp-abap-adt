/**
 * The prompts' contract types: the listed tools a prompt reads, and the
 * instruction it answers as data — steps of a tool and its arguments — which
 * the text is rendered from and which a test parses against the tools.
 */
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type * as z from 'zod';
import type { ReadTransportEntry } from '../../handlers/transport/readonly/handleReadTransportObjects.js';
import type { ToolDefinition } from '../handlers/interfaces.js';
import type { JsonValue } from '../json.js';
import type { AbapSystemKind } from '../systemKind.js';

/** The nine prompts, one per operation. */
export type PromptName =
  | 'create'
  | 'get'
  | 'update'
  | 'delete'
  | 'activate'
  | 'check'
  | 'unit_test'
  | 'where_used'
  | 'transport';

/** The six prompts that work on one object named by its type and name. */
export type ObjectOperation =
  | 'create'
  | 'get'
  | 'update'
  | 'delete'
  | 'activate'
  | 'check';

/** A tool as the server lists it, read by the prompts. */
export interface ListedPromptTool {
  /** The definition `listedTool` was given: its variants carry the members left. */
  readonly definition: ToolDefinition;
  /** The input schema registered for it, with `state_handle` where the server declares it. */
  readonly inputSchema: z.ZodObject;
}

/** What a server lists, as the prompts read it. */
export interface PromptSource {
  /** The server's one kind; `undefined` when it states none. */
  readonly kind: AbapSystemKind | undefined;
  /** Whether every listed tool declares `state_handle` (Streamable HTTP). */
  readonly stateHandle: boolean;
  /** The listed tools, by name. */
  readonly tools: ReadonlyMap<string, ListedPromptTool>;
}

/** A field of a read transport entry that an entry sent takes its value from. */
export type ReadEntryField = keyof Pick<
  ReadTransportEntry,
  'name' | 'type' | 'position' | 'pgmid'
>;

/**
 * Where an argument's value comes from: the user's value; a value an earlier
 * step answers; one the model writes (from a prompt argument it waits for,
 * when `awaits` names one); or the transport entries an earlier
 * step read, each sent with `fields` (sent field, read field).
 */
export type ArgumentValue =
  | { from: 'user'; value: JsonValue }
  | { from: 'step'; step: number; field: string }
  | {
      from: 'model';
      writes: string;
      /** The prompt argument the value waits for: listed still to fill until it is given. */
      awaits?: RequiredArgument;
    }
  | {
      from: 'entries';
      step: number;
      writes: string;
      fields: readonly (readonly [sent: string, read: ReadEntryField])[];
    };

/** A required argument of a tool, with its listed description. */
export interface RequiredArgument {
  readonly name: string;
  readonly description: string | undefined;
}

/** One call of an instruction. */
export interface PromptStep {
  /** The tool called. */
  tool: string;
  /** What the step does, in words, before the call. */
  lead?: string;
  /** The arguments, in the order they are written. */
  arguments: readonly (readonly [string, ArgumentValue])[];
  /** What the step's answer carries that later steps use. */
  keeps?: readonly string[];
  /** The call is repeated until this holds. */
  repeat?: string;
  /** The step is taken when this holds. */
  condition?: string;
  /** The step runs after this step, whatever that step answered. */
  finally?: number;
  /** Words read after the call. */
  note?: string;
  /** The tool's required arguments the step sets none of; empty when there are none. */
  stillToFill: readonly RequiredArgument[];
}

/** An instruction: its headline, its steps and the lines after them. */
export interface PromptInstruction {
  headline: string;
  steps: readonly PromptStep[];
  notes: readonly string[];
}

/** A prompt's arguments: MCP prompt arguments are strings. */
export type PromptArgumentsSchema = Readonly<
  Record<string, z.ZodType<string | undefined, string | undefined>>
>;

/** One prompt as the server registers it. */
export interface AbapPrompt {
  name: PromptName;
  description: string;
  /** Its arguments: each a string, required or optional. */
  argsSchema: PromptArgumentsSchema;
  /** The instruction for the given arguments; throws a prompt refusal for arguments it refuses. */
  instruction(args: Record<string, string | undefined>): PromptInstruction;
}

export type { GetPromptResult };
