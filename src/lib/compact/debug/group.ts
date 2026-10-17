/**
 * The compact debugger: four tools, served by the compact write binaries
 * (`compactToolSetOf`), never by a `-ro` one. Each covers ABAP and AMDP, and
 * each call sends one `AbapDebugger` / `AmdpDebugger` request, chosen by its
 * `operation`; the consumer chains the calls.
 *
 * One debug state per instance holds either ABAP or AMDP: a call of one kind
 * is refused while the instance holds the other.
 *
 * It is a stateful group: the launcher hands the same instance state to it as to
 * the object-oriented debug set, so a handle belongs to the server instance.
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerEntry,
} from '../../handlers/index';
import {
  TOOL_DEFINITION as HandlerDebugBreakpoints_Tool,
  handleHandlerDebugBreakpoints,
} from './handleHandlerDebugBreakpoints';
import {
  TOOL_DEFINITION as HandlerDebugMaintain_Tool,
  handleHandlerDebugMaintain,
} from './handleHandlerDebugMaintain';
import {
  TOOL_DEFINITION as HandlerDebugSession_Tool,
  handleHandlerDebugSession,
} from './handleHandlerDebugSession';
import {
  TOOL_DEFINITION as HandlerDebugStep_Tool,
  handleHandlerDebugStep,
} from './handleHandlerDebugStep';

/**
 * The four tools, each paired with its handler by `defineTool`: the compiler
 * checks that a handler takes what its schema declares. Every registration path
 * hands a `(context, args)` handler the call's context.
 */
export function compactDebugEntries(): HandlerEntry[] {
  return [
    defineTool(HandlerDebugBreakpoints_Tool, handleHandlerDebugBreakpoints),
    defineTool(HandlerDebugSession_Tool, handleHandlerDebugSession),
    defineTool(HandlerDebugStep_Tool, handleHandlerDebugStep),
    defineTool(HandlerDebugMaintain_Tool, handleHandlerDebugMaintain),
  ];
}

export class CompactDebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactDebugHandlers';

  getHandlers(): HandlerEntry[] {
    return compactDebugEntries();
  }
}
