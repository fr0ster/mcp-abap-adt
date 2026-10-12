import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import type { ArgsOf } from '../handlers/argsOf';
import type { AmdpBreakpoint } from './AmdpSession';
import {
  DebugRefusedError,
  type DebugSettings,
  type DebugStartOptions,
  type RunTarget,
} from './DebugSession';
import { lineUriOf } from './objectUri';

export const USER_MODE_SENTENCE =
  'In user mode it catches every request of the request user (the connected SAP user unless another is named), not only programs run by this server.';
/** The AMDP session has no mode and no request user: it is the connected user's. */
export const AMDP_CATCH_SENTENCE =
  'Catches every request of the connected SAP user, not only programs run by this server.';
/** The same, as a fragment the compact start scopes with `amdp:`. */
export const AMDP_CATCH_FACT =
  'catches every request of the connected SAP user, not only programs run by this server.';
export const TAKE_OVER_SENTENCE =
  'Displaces another debugger listening for the same user.';
const SHARED_SET_PREDICATE =
  'are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change replaces that set as a whole.';
/** The shared set as a fragment, lower case, for a text that scopes it (compact: `abap: …`). */
export const SHARED_SET_FACT = `the breakpoints ${SHARED_SET_PREDICATE}`;
export const SHARED_SET_SENTENCE = `Its breakpoints ${SHARED_SET_PREDICATE}`;
/** Both ABAP starts: refused without one breakpoint, before anything is sent. */
export const START_NEEDS_BREAKPOINTS_SENTENCE =
  'Needs at least one breakpoint.';

export const STATE_HANDLE_PROPERTY = {
  state_handle: {
    type: 'string',
    description:
      'Opaque handle identifying the server-held state this operation works on.',
  },
} as const;

export const HOLD_SECONDS_PROPERTY = {
  hold_seconds: {
    type: 'number',
    default: 10,
    description: 'Longest wait for a change, at most 30 seconds.',
  },
} as const;

const LINE_PROPERTIES = {
  object_type: {
    type: 'string',
    description: 'For a line: CLAS, PROG, INCL or FUNC.',
  },
  object_name: {
    type: 'string',
    description: 'For a line: the object holding it.',
  },
  line: {
    type: 'integer',
    description: 'For a line: the line in the object source.',
  },
  include: {
    type: 'string',
    description:
      'For a class: definitions, implementations, macros or testclasses; the main source when omitted.',
  },
  parent_name: {
    type: 'string',
    description: 'For a function module: its function group.',
  },
} as const;
export const LINE_TARGET_PROPERTIES = LINE_PROPERTIES;

export const BREAKPOINTS_PROPERTY = {
  breakpoints: {
    type: 'array',
    description:
      'Breakpoints: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.',
    items: {
      type: 'object',
      properties: {
        ...LINE_PROPERTIES,
        exception_class: {
          type: 'string',
          description: 'Stops where an exception of this class is raised.',
        },
        statement: {
          type: 'string',
          description: 'Stops at every ABAP statement of this keyword.',
        },
        message: {
          type: 'object',
          description:
            'Stops where this message is sent: message class, number, type.',
          properties: {
            id: { type: 'string' },
            number: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['id', 'number', 'type'],
        },
        condition: {
          type: 'string',
          description:
            'A line breakpoint only: stops only when this ABAP condition holds.',
        },
      },
    },
  },
} as const;

export const AMDP_BREAKPOINTS_PROPERTY = {
  breakpoints: {
    type: 'array',
    minItems: 1,
    description: 'Lines in SQLScript methods of a class.',
    items: {
      type: 'object',
      properties: {
        class_name: { type: 'string' },
        line: { type: 'integer', description: 'Line in the class source.' },
      },
      required: ['class_name', 'line'],
    },
  },
} as const;

export const RUN_PROPERTY = {
  run: {
    type: 'object',
    description:
      'A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.',
    properties: {
      kind: { type: 'string', enum: ['class', 'program'] },
      name: { type: 'string' },
    },
    required: ['kind', 'name'],
  },
} as const;

/** What both ABAP starts take as their breakpoints: at least one. */
export const START_BREAKPOINTS_PROPERTY = {
  breakpoints: {
    ...BREAKPOINTS_PROPERTY.breakpoints,
    minItems: 1,
    description:
      'Breakpoints, at least one: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.',
  },
} as const;

export const REQUEST_USER_PROPERTY = {
  request_user: {
    type: 'string',
    description:
      "User mode: the SAP user whose requests are caught; the connected user when omitted. Debugging another user's requests needs the debug authorization for that user. Not taken in terminal mode.",
  },
} as const;

export const DEBUGGING_MODE_PROPERTY = {
  debugging_mode: {
    type: 'string',
    enum: ['user', 'terminal'],
    description:
      "user (when omitted) catches the requests of the request user; terminal catches the requests that carry this debug session's ids and needs no configuration: the run it starts carries them, so without run it catches only requests carrying the same ids.",
  },
} as const;

export const SETTINGS_FIELDS = {
  system_debugging: {
    type: 'boolean',
    description: 'Steps into system programs and stops at breakpoints there.',
  },
  update_debugging: { type: 'boolean', description: 'Debugs update tasks.' },
  create_exception_object: {
    type: 'boolean',
    description:
      'Creates the exception object even where a CATCH does not ask for it.',
  },
  background_rfc: {
    type: 'boolean',
    description: 'Debugs background RFC calls.',
  },
  shared_object_debugging: {
    type: 'boolean',
    description: 'Debugs shared objects.',
  },
} as const;

export const SETTINGS_PROPERTY = {
  settings: {
    type: 'object',
    description:
      'Debugger settings, applied after each attach; a field left out keeps its value.',
    properties: SETTINGS_FIELDS,
  },
} as const;

/** What both ABAP starts take beside the breakpoints and the run. No `default`: the boundary would fill it in. */
export const START_PROPERTIES = {
  ...REQUEST_USER_PROPERTY,
  ...DEBUGGING_MODE_PROPERTY,
  ...SETTINGS_PROPERTY,
} as const;

export type SettingsArg = ArgsOf<{
  type: 'object';
  properties: typeof SETTINGS_FIELDS;
}>;
export type StartArgs = ArgsOf<{
  type: 'object';
  properties: typeof START_PROPERTIES;
}>;

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
export type BreakpointArg = ArgsOf<
  typeof BREAKPOINTS_PROPERTY.breakpoints.items
>;
/** One AMDP breakpoint as the tool arguments give it. */
export type AmdpBreakpointArg = ArgsOf<
  typeof AMDP_BREAKPOINTS_PROPERTY.breakpoints.items
>;
/** A background run as the tool arguments give it. */
export type RunArg = ArgsOf<{
  type: 'object';
  properties: typeof RUN_PROPERTY;
}>['run'];

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
