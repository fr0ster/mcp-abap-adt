import {
  handleListLeftoverSessions,
  TOOL_DEFINITION as ListLeftoverSessions_Tool,
} from '../../../handlers/leftover_session/session/handleListLeftoverSessions';
import {
  handleLogoffLeftoverSession,
  TOOL_DEFINITION as LogoffLeftoverSession_Tool,
} from '../../../handlers/leftover_session/session/handleLogoffLeftoverSession';
import {
  handleResumeLeftoverSession,
  TOOL_DEFINITION as ResumeLeftoverSession_Tool,
} from '../../../handlers/leftover_session/session/handleResumeLeftoverSession';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import { defineTool, type HandlerEntry } from '../interfaces.js';

/**
 * The leftover-session tools (served on every exposition, every transport):
 * the SAP sessions an ended process left open, listed, resumed or logged off
 * by the user. Each works on no connection of the instance (`connectionless`):
 * the server calls it without logging on first.
 */
export function leftoverSessionEntries(): HandlerEntry[] {
  return [
    defineTool(ListLeftoverSessions_Tool, handleListLeftoverSessions),
    defineTool(ResumeLeftoverSession_Tool, handleResumeLeftoverSession),
    defineTool(LogoffLeftoverSession_Tool, handleLogoffLeftoverSession),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class LeftoverSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'LeftoverSessionHandlers';

  getHandlers(): HandlerEntry[] {
    return leftoverSessionEntries();
  }
}
