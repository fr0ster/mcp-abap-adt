import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import type { AmdpBreakpoint } from './AmdpSession';
import {
  DebugRefusedError,
  type DebugSettings,
  type DebugStartOptions,
  type RunTarget,
} from './DebugSession';
import { lineUriOf, RUN_KINDS } from './objectUri';

export const USER_MODE_SENTENCE =
  'In user mode it catches every request of the request user (the connected SAP user, or the one named), from this server and from anywhere else.';
/** The AMDP session has no mode and no request user: it is the connected user's. */
export const AMDP_CATCH_SENTENCE =
  'Catches every request of the connected SAP user, from this server and from anywhere else.';
/** The same, as a fragment the compact start scopes with `amdp:`. */
export const AMDP_CATCH_FACT =
  'catches every request of the connected SAP user, not only programs run by this server.';
export const TAKE_OVER_SENTENCE =
  'Displaces another debugger listening for the same user.';
const SHARED_SET_PREDICATE =
  'are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change rewrites that set as a whole.';
/** The shared set as a fragment, lower case, for a text that scopes it (compact: `abap: …`). */
export const SHARED_SET_FACT = `the breakpoints ${SHARED_SET_PREDICATE}`;
export const SHARED_SET_SENTENCE = `Its breakpoints ${SHARED_SET_PREDICATE}`;
/** Both ABAP starts: refused without one breakpoint, before anything is sent. */
export const START_NEEDS_BREAKPOINTS_SENTENCE =
  'Needs at least one breakpoint.';

const STATE_HANDLE_WORDS =
  'Opaque handle identifying the server-held state this operation works on.';

/** The `state_handle` every debugger tool working on held state requires. */
export const STATE_HANDLE_PROPERTY = {
  state_handle: z.string().describe(STATE_HANDLE_WORDS),
};

export const HOLD_SECONDS_PROPERTY = {
  hold_seconds: z
    .number()
    .default(10)
    .optional()
    .describe('Longest wait for a change, at most 30 seconds.'),
};

/** The words of a line's fields, shared by a breakpoint's line and a step's target. */
export const LINE_WORDS = {
  object_type: 'For a line: CLAS, PROG, INCL or FUNC.',
  object_name: 'For a line: the object holding it.',
  line: 'For a line: the line in the object source.',
  include:
    'For a class: definitions, implementations, macros or testclasses; the main source when omitted.',
  parent_name: 'For a function module: its function group.',
} as const;

const LINE_PROPERTIES = {
  object_type: z.string().optional().describe(LINE_WORDS.object_type),
  object_name: z.string().optional().describe(LINE_WORDS.object_name),
  line: z.number().int().optional().describe(LINE_WORDS.line),
  include: z.string().optional().describe(LINE_WORDS.include),
  parent_name: z.string().optional().describe(LINE_WORDS.parent_name),
};
export const LINE_TARGET_PROPERTIES = LINE_PROPERTIES;

/** One breakpoint of a tool's `breakpoints`. */
export const BREAKPOINT_ITEM = z.object({
  ...LINE_PROPERTIES,
  exception_class: z
    .string()
    .optional()
    .describe('Stops where an exception of this class is raised.'),
  statement: z
    .string()
    .optional()
    .describe('Stops at every ABAP statement of this keyword.'),
  message: z
    .object({ id: z.string(), number: z.string(), type: z.string() })
    .optional()
    .describe('Stops where this message is sent: message class, number, type.'),
  condition: z
    .string()
    .optional()
    .describe(
      'A line breakpoint only: stops only when this ABAP condition holds.',
    ),
});

/** The words of `breakpoints` where any number is taken. */
export const BREAKPOINTS_WORDS =
  'Breakpoints: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.';

/** `breakpoints` where the tool requires it and takes any number. */
export const BREAKPOINTS_PROPERTY = {
  breakpoints: z.array(BREAKPOINT_ITEM).describe(BREAKPOINTS_WORDS),
};

export const AMDP_BREAKPOINTS_PROPERTY = {
  breakpoints: z
    .array(
      z.object({
        class_name: z.string(),
        line: z.number().int().describe('Line in the class source.'),
      }),
    )
    .min(1)
    .describe('Lines in SQLScript methods of a class.'),
};

export const RUN_PROPERTY = {
  run: z
    .object({ kind: z.enum(RUN_KINDS), name: z.string() })
    .optional()
    .describe(
      'A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.',
    ),
};

/** What both ABAP starts take as their breakpoints: at least one. */
export const START_BREAKPOINTS_PROPERTY = {
  breakpoints: z
    .array(BREAKPOINT_ITEM)
    .min(1)
    .describe(
      'Breakpoints, at least one: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.',
    ),
};

export const REQUEST_USER_PROPERTY = {
  request_user: z
    .string()
    .optional()
    .describe(
      "User mode: the SAP user whose requests are caught; the connected user when omitted. Debugging another user's requests needs the debug authorization for that user. Not taken in terminal mode.",
    ),
};

export const DEBUGGING_MODE_PROPERTY = {
  debugging_mode: z
    .enum(['user', 'terminal'])
    .optional()
    .describe(
      "user (when omitted) catches the requests of the request user; terminal catches the requests that carry this debug session's ids and needs no configuration: the run it starts carries them, so without run it catches only requests carrying the same ids.",
    ),
};

export const SETTINGS_FIELDS = {
  system_debugging: z
    .boolean()
    .optional()
    .describe('Steps into system programs and stops at breakpoints there.'),
  update_debugging: z.boolean().optional().describe('Debugs update tasks.'),
  create_exception_object: z
    .boolean()
    .optional()
    .describe(
      'Creates the exception object even where a CATCH does not ask for it.',
    ),
  background_rfc: z
    .boolean()
    .optional()
    .describe('Debugs background RFC calls.'),
  shared_object_debugging: z
    .boolean()
    .optional()
    .describe('Debugs shared objects.'),
};

/** The debugger settings as one object of the arguments. */
export const SETTINGS_OBJECT = z.object(SETTINGS_FIELDS);

export const SETTINGS_PROPERTY = {
  settings: SETTINGS_OBJECT.optional().describe(
    'Debugger settings, applied after each attach; a field left out keeps its value.',
  ),
};

/** What both ABAP starts take beside the breakpoints and the run. No `default`: the boundary would fill it in. */
export const START_PROPERTIES = {
  ...REQUEST_USER_PROPERTY,
  ...DEBUGGING_MODE_PROPERTY,
  ...SETTINGS_PROPERTY,
};

const START_OBJECT = z.object(START_PROPERTIES);

export type SettingsArg = z.output<typeof SETTINGS_OBJECT>;
export type StartArgs = z.output<typeof START_OBJECT>;

/** The settings the session takes, by the library's names; a field not given is not sent. */
export function settingsFromArgs(raw: SettingsArg): DebugSettings {
  const out: DebugSettings = {};
  if (raw.system_debugging !== undefined)
    out.systemDebugging = raw.system_debugging;
  if (raw.update_debugging !== undefined)
    out.updateDebugging = raw.update_debugging;
  if (raw.create_exception_object !== undefined)
    out.createExceptionObject = raw.create_exception_object;
  if (raw.background_rfc !== undefined) out.backgroundRFC = raw.background_rfc;
  if (raw.shared_object_debugging !== undefined)
    out.sharedObjectDebugging = raw.shared_object_debugging;
  return out;
}

/** A start's identity and settings; what is not given stays out, and the session decides the default. Throws `DebugRefusedError` for a supplied blank `request_user`, or a supplied one with terminal mode. */
export function startOptionsFromArgs(
  args: StartArgs,
): Pick<DebugStartOptions, 'requestUser' | 'debuggingMode' | 'settings'> {
  // Presence first, then normalisation: a supplied blank is refused in every mode
  // and a supplied name with terminal is refused, both before the wire. The session
  // makes the same checks; this keeps the refusal at the tool boundary too.
  if (args.request_user !== undefined && !args.request_user.trim())
    throw new DebugRefusedError('request_user is empty');
  if (args.request_user !== undefined && args.debugging_mode === 'terminal')
    throw new DebugRefusedError(
      'request_user does not apply to terminal mode: the system reads no request user there',
    );
  return {
    ...(args.request_user !== undefined
      ? { requestUser: args.request_user.trim() }
      : {}),
    ...(args.debugging_mode ? { debuggingMode: args.debugging_mode } : {}),
    ...(args.settings ? { settings: settingsFromArgs(args.settings) } : {}),
  };
}

/** One breakpoint as the tool arguments give it. */
export type BreakpointArg = z.output<typeof BREAKPOINT_ITEM>;
/** One AMDP breakpoint as the tool arguments give it. */
export type AmdpBreakpointArg = z.output<
  typeof AMDP_BREAKPOINTS_PROPERTY.breakpoints
>[number];
/** A background run as the tool arguments give it. */
export type RunArg = z.output<typeof RUN_PROPERTY.run>;

/**
 * The breakpoints the session takes. Kept here, not in the schema: which fields
 * one breakpoint needs depends on its kind. How many a tool takes is its
 * schema's `minItems`.
 */
export function breakpointsFromArgs(
  raw: readonly BreakpointArg[],
): IDebuggerBreakpoint[] {
  return raw.map((b, i) => {
    // Only a line breakpoint takes a condition: the system ignores it on the
    // other kinds, and interfaces-adt 15 does not type it there.
    const noCondition = (kind: string) => {
      if (b.condition)
        throw new Error(
          `breakpoints[${i}] (${kind}): a condition applies to a line breakpoint only`,
        );
    };
    if (b.exception_class) {
      noCondition('exception');
      return {
        kind: 'exception',
        exceptionClass: b.exception_class.toUpperCase(),
      };
    }
    if (b.statement) {
      noCondition('statement');
      return {
        kind: 'statement',
        statement: b.statement.toUpperCase(),
      };
    }
    if (b.message) {
      noCondition('message');
      return {
        kind: 'message',
        msgId: b.message.id.toUpperCase(),
        msgNo: b.message.number,
        msgTy: b.message.type.toUpperCase(),
      };
    }
    if (b.object_type && b.object_name && b.line !== undefined) {
      return {
        kind: 'line',
        uri: lineUriOf(
          {
            object_type: b.object_type,
            object_name: b.object_name,
            include: b.include,
            parent_name: b.parent_name,
          },
          b.line,
        ),
        ...(b.condition ? { condition: b.condition } : {}),
      };
    }
    throw new Error(
      `breakpoints[${i}]: a line needs object_type, object_name and line; or exception_class, statement or message`,
    );
  });
}

/** The AMDP breakpoints the session takes; at least one is the schema's `minItems`. */
export function amdpBreakpointsFromArgs(
  raw: readonly AmdpBreakpointArg[],
): AmdpBreakpoint[] {
  return raw.map((b) => ({ class_name: b.class_name, line: b.line }));
}

/** The run the session starts; an empty name, which the schema admits, is refused. */
export function runFromArgs(raw: RunArg): RunTarget | undefined {
  if (!raw) return undefined;
  if (!raw.name) throw new Error('run: a name');
  return { kind: raw.kind, name: raw.name.trim().toUpperCase() };
}
