/**
 * The compact leftover-session tools, served by every compact stdio binary:
 * the SAP sessions an ended process left open, listed or logged off by the
 * user. Each works on no connection of the instance (`connectionless`).
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerContext,
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

export function compactLeftoverSessionEntries(): HandlerEntry[] {
  return [
    defineTool(
      HandlerLeftoverSessionList_Tool,
      handleHandlerLeftoverSessionList,
    ),
    defineTool(
      HandlerLeftoverSessionLogoff_Tool,
      handleHandlerLeftoverSessionLogoff,
    ),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class CompactLeftoverSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactLeftoverSessionHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return compactLeftoverSessionEntries();
  }
}

/**
 * The compact leftover-session list alone, for the read-only compact sets: a
 * logoff ends a SAP session and releases every lock it holds, which changes
 * the system, so only the full compact binaries serve it.
 */
export class CompactLeftoverSessionListHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactLeftoverSessionListHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return compactLeftoverSessionEntries().filter(
      (entry) =>
        entry.toolDefinition.name === HandlerLeftoverSessionList_Tool.name,
    );
  }
}
