/**
 * The compact leftover-session tools, served beside every compact
 * exposition: the SAP sessions an ended process left open, listed, resumed
 * or logged off by the user. Each works on no connection of the instance
 * (`connectionless`).
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerEntry,
} from '../../handlers/index';
import {
  TOOL_DEFINITION as HandlerLeftoverSessionList_Tool,
  handleHandlerLeftoverSessionList,
} from './handleHandlerLeftoverSessionList';
import {
  TOOL_DEFINITION as HandlerLeftoverSessionLogoff_Tool,
  handleHandlerLeftoverSessionLogoff,
} from './handleHandlerLeftoverSessionLogoff';
import {
  TOOL_DEFINITION as HandlerLeftoverSessionResume_Tool,
  handleHandlerLeftoverSessionResume,
} from './handleHandlerLeftoverSessionResume';

export function compactLeftoverSessionEntries(): HandlerEntry[] {
  return [
    defineTool(
      HandlerLeftoverSessionList_Tool,
      handleHandlerLeftoverSessionList,
    ),
    defineTool(
      HandlerLeftoverSessionResume_Tool,
      handleHandlerLeftoverSessionResume,
    ),
    defineTool(
      HandlerLeftoverSessionLogoff_Tool,
      handleHandlerLeftoverSessionLogoff,
    ),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class CompactLeftoverSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactLeftoverSessionHandlers';

  getHandlers(): HandlerEntry[] {
    return compactLeftoverSessionEntries();
  }
}
