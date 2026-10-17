import type { IDebuggerLineBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import {
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  readXmlDocument,
} from '../../debugger/index';
import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { DETAIL_PROPERTY } from '../index';
import {
  IDENTITY_PROPERTIES,
  identityOf,
  KIND_PROPERTY,
  needed,
  onceAnswer,
  openingStateHandleProperty,
  refuseOperation,
} from './shared';

const ABAP_OPERATIONS = [
  'setBreakpoints',
  'syncBreakpoints',
  'deleteBreakpoint',
  'createWatchpoint',
  'listWatchpoints',
  'deleteWatchpoint',
] as const;
const AMDP_OPERATIONS = ['syncBreakpoints'] as const;

export const TOOL_DEFINITION = {
  name: 'HandlerDebugBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Debugger breakpoints and watchpoints: each call sends one SAP request, the operation's, and answers what SAP answered. kind abap: setBreakpoints replaces the breakpoint set of this debugging identity with breakpoints and answers each row SAP placed or refused; syncBreakpoints replaces the full set (sync_scope full) or the part of the objects in sync_objects (sync_scope partial); deleteBreakpoint deletes breakpoint_id; createWatchpoint, listWatchpoints and deleteWatchpoint work on the attached debuggee. In user mode the breakpoints catch every request of the request user; the set is one per SAP user and request user, shared by every IDE of that user, and each change replaces it as a whole. kind amdp: syncBreakpoints replaces the breakpoints of the running AMDP session and answers the request id; SAP confirms them in a SYNC_BREAKPOINTS event. The answer carries state_handle, and for abap the identity in force.",
  inputSchema: {
    type: 'object',
    properties: {
      ...openingStateHandleProperty('abap setBreakpoints and syncBreakpoints'),
      ...KIND_PROPERTY,
      operation: {
        type: 'string',
        enum: [...ABAP_OPERATIONS],
        description:
          'The one request: abap setBreakpoints, syncBreakpoints, deleteBreakpoint, createWatchpoint, listWatchpoints or deleteWatchpoint; amdp syncBreakpoints.',
      },
      breakpoints: {
        ...BREAKPOINTS_PROPERTY.breakpoints,
        description:
          'setBreakpoints and syncBreakpoints: abap a line, an exception class, an ABAP statement or a message, a line breakpoint may carry a condition; amdp object_name (the class) and line of each, an empty list clears them.',
      },
      sync_scope: {
        type: 'string',
        enum: ['full', 'partial'],
        description:
          'abap syncBreakpoints: full replaces every breakpoint of the set; partial replaces those of the objects in sync_objects and takes line breakpoints.',
      },
      sync_objects: {
        type: 'array',
        items: { type: 'string' },
        description:
          'abap syncBreakpoints with sync_scope partial: the ADT URIs of the objects whose breakpoints are replaced.',
      },
      breakpoint_id: {
        type: 'string',
        description: 'abap deleteBreakpoint: the id SAP gave the breakpoint.',
      },
      variable_name: {
        type: 'string',
        description: 'abap createWatchpoint: the variable watched.',
      },
      condition: {
        type: 'string',
        description:
          'abap createWatchpoint: the ABAP condition the watchpoint stops on.',
      },
      watchpoint_id: {
        type: 'string',
        description: 'abap deleteWatchpoint: the id SAP gave the watchpoint.',
      },
      ...IDENTITY_PROPERTIES,
      ...DETAIL_PROPERTY,
    },
    required: ['kind', 'operation'],
  },
} as const;

type Args = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerDebugBreakpoints(
  context: HandlerContext,
  args: Args,
) {
  const op = args.operation;
  if (args.kind === 'amdp') {
    return onceAnswer(context, args, 'amdp', false, async (d) => {
      if (op !== 'syncBreakpoints')
        refuseOperation('amdp', op, AMDP_OPERATIONS);
      const list = needed(
        args.breakpoints,
        'breakpoints: needed for syncBreakpoints',
      );
      return d.amdp.syncBreakpointsOnce(
        list.map((b, i) => {
          if (!b.object_name || b.line === undefined)
            throw new Error(`breakpoints[${i}]: object_name and line`);
          return { class_name: b.object_name, line: b.line };
        }),
      );
    });
  }
  const identity = () => identityOf(args);
  switch (op) {
    case 'setBreakpoints':
      return onceAnswer(context, args, 'abap', true, async (d) =>
        d.abap.setBreakpointsOnce(
          identity(),
          breakpointsFromArgs(
            needed(args.breakpoints, 'breakpoints: needed for setBreakpoints'),
          ),
        ),
      );
    case 'syncBreakpoints':
      return onceAnswer(context, args, 'abap', true, async (d) => {
        const scope = needed(
          args.sync_scope,
          'sync_scope: needed for syncBreakpoints',
        );
        const list = breakpointsFromArgs(
          needed(args.breakpoints, 'breakpoints: needed for syncBreakpoints'),
        );
        if (scope === 'full')
          return d.abap.syncBreakpointsOnce(identity(), {
            scope: 'full',
            breakpoints: list,
          });
        const [first, ...rest] = args.sync_objects ?? [];
        if (first === undefined)
          throw new Error('sync_objects: needed for sync_scope partial');
        const lines = list.map((b, i) => {
          if (b.kind !== 'line')
            throw new Error(
              `breakpoints[${i}]: sync_scope partial takes line breakpoints`,
            );
          return b as IDebuggerLineBreakpoint;
        });
        return d.abap.syncBreakpointsOnce(identity(), {
          scope: 'partial',
          objects: [first, ...rest],
          breakpoints: lines,
        });
      });
    case 'deleteBreakpoint':
      return onceAnswer(context, args, 'abap', false, async (d) =>
        d.abap.deleteBreakpointOnce(
          identity(),
          needed(
            args.breakpoint_id,
            'breakpoint_id: needed for deleteBreakpoint',
          ),
        ),
      );
    case 'createWatchpoint':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) =>
          d.abap.createWatchpoint(
            needed(
              args.variable_name,
              'variable_name: needed for createWatchpoint',
            ),
            args.condition,
          ),
        readXmlDocument,
      );
    case 'listWatchpoints':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => d.abap.listWatchpoints(),
        readXmlDocument,
      );
    case 'deleteWatchpoint':
      return onceAnswer(context, args, 'abap', false, async (d) => {
        const id = needed(
          args.watchpoint_id,
          'watchpoint_id: needed for deleteWatchpoint',
        );
        await d.abap.deleteWatchpoint(id);
        return { value: { deleted: id }, raw: '' };
      });
    default:
      return onceAnswer(context, args, 'abap', false, async () =>
        refuseOperation('abap', op, ABAP_OPERATIONS),
      );
  }
}
