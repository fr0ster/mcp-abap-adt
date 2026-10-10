import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import type { ArgsOf } from '../handlers/argsOf';
import type { AmdpBreakpoint } from './AmdpSession';
import type { RunTarget } from './DebugSession';
import { lineUriOf } from './objectUri';

export const USER_MODE_SENTENCE =
  'Catches every request of the connected SAP user, not only programs run by this server.';
export const TAKE_OVER_SENTENCE =
  'Displaces another debugger listening for the same user.';

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
      'Breakpoints: a line, an exception class, an ABAP statement or a message; each with an optional condition.',
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
          description: 'Stops only when this ABAP condition holds.',
        },
      },
    },
  },
} as const;

export const AMDP_BREAKPOINTS_PROPERTY = {
  breakpoints: {
    type: 'array',
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
 * The breakpoints the session takes. Kept here, not in the schema: at least one
 * (the schema states no minimum), and which fields one breakpoint needs depends
 * on its kind.
 */
export function breakpointsFromArgs(
  raw: readonly BreakpointArg[] | undefined,
): IDebuggerBreakpoint[] {
  if (!raw || raw.length === 0) {
    throw new Error('breakpoints: give at least one');
  }
  return raw.map((b, i) => {
    const condition = b.condition ? { condition: b.condition } : {};
    if (b.exception_class) {
      return {
        kind: 'exception',
        exceptionClass: b.exception_class.toUpperCase(),
        ...condition,
      };
    }
    if (b.statement) {
      return {
        kind: 'statement',
        statement: b.statement.toUpperCase(),
        ...condition,
      };
    }
    if (b.message) {
      return {
        kind: 'message',
        msgId: b.message.id.toUpperCase(),
        msgNo: b.message.number,
        msgTy: b.message.type.toUpperCase(),
        ...condition,
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
        ...condition,
      };
    }
    throw new Error(
      `breakpoints[${i}]: a line needs object_type, object_name and line; or exception_class, statement or message`,
    );
  });
}

/** The AMDP breakpoints the session takes: at least one, which the schema does not state. */
export function amdpBreakpointsFromArgs(
  raw: readonly AmdpBreakpointArg[],
): AmdpBreakpoint[] {
  if (raw.length === 0) {
    throw new Error('breakpoints: give at least one');
  }
  return raw.map((b) => ({ class_name: b.class_name, line: b.line }));
}

/** The run the session starts; an empty name, which the schema admits, is refused. */
export function runFromArgs(raw: RunArg): RunTarget | undefined {
  if (!raw) return undefined;
  if (!raw.name) throw new Error('run: a name');
  return { kind: raw.kind, name: raw.name.trim().toUpperCase() };
}
