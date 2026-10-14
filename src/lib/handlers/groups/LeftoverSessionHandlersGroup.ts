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
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

/** Which of the leftover-session tools a tool set serves. */
export interface LeftoverSessionToolsOptions {
  /**
   * The resume, served only with a writing set: a resumed session is for
   * finishing a write or an unlock. The list and the logoff (a system
   * action, not a data change) are served with every set. Default: served.
   */
  resume?: boolean;
}

/**
 * The leftover-session tools (every stdio binary — the resume only with a
 * writing one; no http or sse binary serves them): the SAP sessions an ended process left
 * open, listed, resumed or logged off by the user. Each works on no
 * connection of the instance (`connectionless`): the server calls it
 * without logging on first.
 */
export function leftoverSessionEntries(
  options: LeftoverSessionToolsOptions = {},
): HandlerEntry[] {
  return [
    defineTool(ListLeftoverSessions_Tool, handleListLeftoverSessions),
    ...(options.resume === false
      ? []
      : [defineTool(ResumeLeftoverSession_Tool, handleResumeLeftoverSession)]),
    defineTool(LogoffLeftoverSession_Tool, handleLogoffLeftoverSession),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class LeftoverSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'LeftoverSessionHandlers';

  constructor(
    context: HandlerContext,
    private readonly options: LeftoverSessionToolsOptions = {},
  ) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return leftoverSessionEntries(this.options);
  }
}
