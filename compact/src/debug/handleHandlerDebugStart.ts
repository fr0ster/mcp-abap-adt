import { DETAIL_PROPERTY } from '@mcp-abap-adt/lib/compact-shared';
import {
  amdpBreakpointsFromArgs,
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  debugAnswer,
  debugStateAnswer,
  RUN_PROPERTY,
  requireDebugger,
  runFromArgs,
  TAKE_OVER_SENTENCE,
  USER_MODE_SENTENCE,
} from '@mcp-abap-adt/lib/debugger';
import type { ArgsOf, HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { refuseOtherKind } from './shared';

export const TOOL_DEFINITION = {
  name: 'HandlerDebugStart',
  available_in: ['onprem', 'cloud'] as const,
  description: `Debugger start. kind: abap (line, exception, statement or message breakpoints) or amdp (lines in SQLScript methods). Arms the breakpoints, listens (abap) or opens an AMDP session, and optionally runs a class or report in the background. take_over: abap — ${TAKE_OVER_SENTENCE}; amdp — ends an AMDP session of this user left behind. ${USER_MODE_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['abap', 'amdp'],
        description:
          'abap debugs ABAP code; amdp debugs SQLScript methods of a class.',
      },
      breakpoints: {
        ...BREAKPOINTS_PROPERTY.breakpoints,
        description:
          'abap: a line, an exception class, an ABAP statement or a message, each with an optional condition. amdp: object_name (the class) and line of each.',
      },
      take_over: {
        type: 'boolean',
        default: false,
        description:
          'Takes over from an existing debugger of this user instead of refusing.',
      },
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['kind', 'breakpoints'],
  },
} as const;

export async function handleHandlerDebugStart(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  if (args.kind === 'amdp') {
    return debugAnswer(
      args,
      async () => {
        refuseOtherKind(context, 'amdp');
        const d = requireDebugger(context, args, { create: 'amdp' });
        // The compact items name the class `object_name`; the session takes
        // `class_name`. The schema serves both kinds, so it cannot require them.
        const r = await d.amdp.start({
          stopExisting: args.take_over ?? false,
          breakpoints: amdpBreakpointsFromArgs(
            args.breakpoints.map((b, i) => {
              if (!b.object_name || b.line === undefined)
                throw new Error(`breakpoints[${i}]: object_name and line`);
              return { class_name: b.object_name, line: b.line };
            }),
          ),
          run: runFromArgs(args.run),
        });
        return { value: r, raw: JSON.stringify(r) };
      },
      (v) => v,
      (v) => v,
      () => ({ state_handle: context.state!.handle }),
    );
  }
  return debugStateAnswer(
    args,
    async () => {
      refuseOtherKind(context, 'abap');
      const d = requireDebugger(context, args, { create: 'abap' });
      return d.abap.start(args.take_over ? 'takeOver' : 'refuse', {
        breakpoints: breakpointsFromArgs(args.breakpoints),
        run: runFromArgs(args.run),
      });
    },
    () => ({
      state_handle: context.state!.handle,
      terminal_id: context.debugger!().abap.ids.terminalId,
      ide_id: context.debugger!().abap.ids.ideId,
    }),
  );
}
