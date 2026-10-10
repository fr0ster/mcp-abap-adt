/**
 * The compact debugger: four verb tools, served with `--exposition=…,debug`.
 *
 * One debug session per instance holds either ABAP or AMDP, never both. The kind is
 * fixed by the start; the other three verbs read it from the instance.
 *
 * It is a stateful group: the launcher hands the same instance state to it as to
 * the object-oriented debug set, so a handle belongs to the server instance.
 */
import {
  BaseHandlerGroup,
  type HandlerContext,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
import {
  TOOL_DEFINITION as HandlerDebugStart_Tool,
  handleHandlerDebugStart,
} from './handleHandlerDebugStart';
import {
  TOOL_DEFINITION as HandlerDebugStep_Tool,
  handleHandlerDebugStep,
} from './handleHandlerDebugStep';
import {
  TOOL_DEFINITION as HandlerDebugView_Tool,
  handleHandlerDebugView,
} from './handleHandlerDebugView';
import {
  TOOL_DEFINITION as HandlerDebugWait_Tool,
  handleHandlerDebugWait,
} from './handleHandlerDebugWait';

/** Built against a live context, as the other compact halves are. */
export function compactDebugEntries(
  getContext: () => HandlerContext,
): HandlerEntry[] {
  const withContext = <TArgs, TResult>(
    handler: (context: HandlerContext, args: TArgs) => TResult,
  ) => {
    return (args: unknown) => handler(getContext(), args as TArgs);
  };
  return [
    {
      toolDefinition: HandlerDebugStart_Tool,
      handler: withContext(handleHandlerDebugStart),
    },
    {
      toolDefinition: HandlerDebugWait_Tool,
      handler: withContext(handleHandlerDebugWait),
    },
    {
      toolDefinition: HandlerDebugView_Tool,
      handler: withContext(handleHandlerDebugView),
    },
    {
      toolDefinition: HandlerDebugStep_Tool,
      handler: withContext(handleHandlerDebugStep),
    },
  ];
}

export class CompactDebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactDebugHandlers';

  getHandlers(): HandlerEntry[] {
    return compactDebugEntries(() => this.context);
  }
}
