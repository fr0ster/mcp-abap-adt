import {
  handleListLeftoverSessions,
  TOOL_DEFINITION as ListLeftoverSessions_Tool,
} from '../../../handlers/leftover_session/session/handleListLeftoverSessions';
import {
  handleLogoffLeftoverSession,
  TOOL_DEFINITION as LogoffLeftoverSession_Tool,
} from '../../../handlers/leftover_session/session/handleLogoffLeftoverSession';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

/**
 * The leftover-session tools (every stdio binary; no http or sse binary
 * serves them): the SAP sessions an ended process left open, listed or
 * logged off by the user. None resumes one: a stdio process is born on the
 * one leftover of its destination at its start, before any tool call. Each
 * works on no connection of the instance (`connectionless`): the server
 * calls it without logging on first.
 */
export function leftoverSessionEntries(): HandlerEntry[] {
  return [
    defineTool(ListLeftoverSessions_Tool, handleListLeftoverSessions),
    defineTool(LogoffLeftoverSession_Tool, handleLogoffLeftoverSession),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class LeftoverSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'LeftoverSessionHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return leftoverSessionEntries();
  }
}
