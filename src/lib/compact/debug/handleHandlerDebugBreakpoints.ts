import * as z from 'zod';
import {
  BREAKPOINT_ITEM,
  breakpointsFromArgs,
  readXmlDocument,
} from '../../debugger/index';
import {
  type DescriptionParts,
  pairsPurpose,
  toolDescription,
} from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { DETAIL_SHAPE } from '../../strategies/detail';
import { either, listed } from '../memberTexts';
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

/** Every operation `operation` takes, either kind's. */
export const BREAKPOINT_OPERATIONS = [...ABAP_OPERATIONS] as const;
type BreakpointOperation = (typeof BREAKPOINT_OPERATIONS)[number];

/** Each operation as an action and object pair (owner). */
const PAIRS: { readonly [K in BreakpointOperation]: string } = {
  setBreakpoints: 'sets the ABAP breakpoints of this debugging identity',
  syncBreakpoints: 'syncs the ABAP or AMDP breakpoints',
  deleteBreakpoint: 'deletes an ABAP breakpoint',
  createWatchpoint: 'creates a watchpoint on a variable',
  listWatchpoints: 'lists the watchpoints',
  deleteWatchpoint: 'deletes a watchpoint',
};

/** `HandlerDebugBreakpoints`' parts with `operations`: each by its function. */
export function handlerDebugBreakpointsParts(
  operations: readonly BreakpointOperation[],
): DescriptionParts {
  return {
    tag: 'debug',
    purpose: pairsPurpose(operations.map((op) => PAIRS[op])),
  };
}

/**
 * `HandlerDebugBreakpoints`' description and schema with `operations`:
 * each text names only the operations given, a property only one of them
 * takes.
 */
export function handlerDebugBreakpointsDefinition(
  operations: readonly BreakpointOperation[],
) {
  const has = (op: BreakpointOperation) => operations.includes(op);
  const amdp = AMDP_OPERATIONS.filter((op) => operations.includes(op));
  const writes = operations.filter(
    (op) => op === 'setBreakpoints' || op === 'syncBreakpoints',
  );
  const request = [
    `abap ${either(operations)}`,
    ...(amdp.length > 0 ? [`amdp ${either(amdp)}`] : []),
  ];
  return {
    description: toolDescription(handlerDebugBreakpointsParts(operations)),
    inputSchema: z.object({
      ...(writes.length > 0
        ? openingStateHandleProperty(`abap ${listed(writes)}`)
        : OWN_STATE_HANDLE),
      ...KIND_PROPERTY,
      operation: listedValues(operations).describe(
        `The one request: ${request.join('; ')}.`,
      ),
      ...(writes.length > 0
        ? {
            breakpoints: z
              .array(BREAKPOINT_ITEM)
              .optional()
              .describe(
                `${listed(writes)}: abap a line, an exception class, an ABAP statement or a message, a line breakpoint may carry a condition${has('syncBreakpoints') ? '; amdp object_name (the class) and line of each, an empty list clears them' : ''}.`,
              ),
          }
        : {}),
      ...(has('syncBreakpoints') ? SYNC_PROPERTIES : {}),
      ...(has('deleteBreakpoint') ? DELETE_BREAKPOINT_PROPERTIES : {}),
      ...(has('createWatchpoint') ? CREATE_WATCHPOINT_PROPERTIES : {}),
      ...(has('deleteWatchpoint') ? DELETE_WATCHPOINT_PROPERTIES : {}),
      ...IDENTITY_PROPERTIES,
      ...DETAIL_SHAPE,
    }),
  };
}

/** The handle where no operation left opens the debug state. */
const OWN_STATE_HANDLE = {
  state_handle: z
    .string()
    .optional()
    .describe(
      "The handle of this server's debug state; every operation takes it.",
    ),
};

const SYNC_PROPERTIES = {
  sync_scope: z
    .enum(['full', 'partial'])
    .optional()
    .describe(
      'abap syncBreakpoints: full replaces every breakpoint of the set; partial replaces those of the objects in sync_objects and takes line breakpoints.',
    ),
  sync_objects: z
    .array(z.string())
    .optional()
    .describe(
      'abap syncBreakpoints with sync_scope partial: the ADT URIs of the objects whose breakpoints are replaced.',
    ),
};

const DELETE_BREAKPOINT_PROPERTIES = {
  breakpoint_id: z
    .string()
    .optional()
    .describe('abap deleteBreakpoint: the id SAP gave the breakpoint.'),
};

const CREATE_WATCHPOINT_PROPERTIES = {
  variable_name: z
    .string()
    .optional()
    .describe('abap createWatchpoint: the variable watched.'),
  condition: z
    .string()
    .optional()
    .describe(
      'abap createWatchpoint: the ABAP condition the watchpoint stops on.',
    ),
};

const DELETE_WATCHPOINT_PROPERTIES = {
  watchpoint_id: z
    .string()
    .optional()
    .describe('abap deleteWatchpoint: the id SAP gave the watchpoint.'),
};

export const TOOL_DEFINITION = {
  name: 'HandlerDebugBreakpoints',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    handlerDebugBreakpointsParts(BREAKPOINT_OPERATIONS),
  ),
  inputSchema: z.object({
    ...openingStateHandleProperty('abap setBreakpoints and syncBreakpoints'),
    ...KIND_PROPERTY,
    operation: z
      .enum(BREAKPOINT_OPERATIONS)
      .describe(
        'The one request: abap setBreakpoints, syncBreakpoints, deleteBreakpoint, createWatchpoint, listWatchpoints or deleteWatchpoint; amdp syncBreakpoints.',
      ),
    breakpoints: z
      .array(BREAKPOINT_ITEM)
      .optional()
      .describe(
        'setBreakpoints and syncBreakpoints: abap a line, an exception class, an ABAP statement or a message, a line breakpoint may carry a condition; amdp object_name (the class) and line of each, an empty list clears them.',
      )
      .optional()
      .describe(
        'setBreakpoints and syncBreakpoints: abap a line, an exception class, an ABAP statement or a message, a line breakpoint may carry a condition; amdp object_name (the class) and line of each, an empty list clears them.',
      ),
    sync_scope: z
      .enum(['full', 'partial'])
      .optional()
      .describe(
        'abap syncBreakpoints: full replaces every breakpoint of the set; partial replaces those of the objects in sync_objects and takes line breakpoints.',
      ),
    sync_objects: z
      .array(z.string())
      .optional()
      .describe(
        'abap syncBreakpoints with sync_scope partial: the ADT URIs of the objects whose breakpoints are replaced.',
      ),
    breakpoint_id: z
      .string()
      .optional()
      .describe('abap deleteBreakpoint: the id SAP gave the breakpoint.'),
    variable_name: z
      .string()
      .optional()
      .describe('abap createWatchpoint: the variable watched.'),
    condition: z
      .string()
      .optional()
      .describe(
        'abap createWatchpoint: the ABAP condition the watchpoint stops on.',
      ),
    watchpoint_id: z
      .string()
      .optional()
      .describe('abap deleteWatchpoint: the id SAP gave the watchpoint.'),
    ...IDENTITY_PROPERTIES,
    ...DETAIL_SHAPE,
  }),
} as const;

type Args = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
          return b;
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
