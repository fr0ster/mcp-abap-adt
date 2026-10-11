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
  defineTool,
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

/**
 * The four verbs, each paired with its handler by `defineTool`: the compiler
 * checks that a handler takes what its schema declares. Every registration path
 * hands a `(context, args)` handler the call's context.
 */
export function compactDebugEntries(): HandlerEntry[] {
  return [
    defineTool(HandlerDebugStart_Tool, handleHandlerDebugStart),
    defineTool(HandlerDebugWait_Tool, handleHandlerDebugWait),
    defineTool(HandlerDebugView_Tool, handleHandlerDebugView),
    defineTool(HandlerDebugStep_Tool, handleHandlerDebugStep),
  ];
}

export class CompactDebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactDebugHandlers';

  getHandlers(): HandlerEntry[] {
    return compactDebugEntries();
  }
}
