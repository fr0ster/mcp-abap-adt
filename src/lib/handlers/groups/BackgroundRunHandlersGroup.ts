import {
  TOOL_DEFINITION as DiscardBackgroundRun_Tool,
  handleDiscardBackgroundRun,
} from '../../../handlers/background_run/readonly/handleDiscardBackgroundRun';
import {
  TOOL_DEFINITION as GetBackgroundRun_Tool,
  handleGetBackgroundRun,
} from '../../../handlers/background_run/readonly/handleGetBackgroundRun';
import {
  handleListBackgroundRuns,
  TOOL_DEFINITION as ListBackgroundRuns_Tool,
} from '../../../handlers/background_run/readonly/handleListBackgroundRuns';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import { defineTool, type HandlerEntry } from '../interfaces.js';

/**
 * The background-run tools, served beside the run tools (`RuntimeRunClass`,
 * `RuntimeRunProgram`): a run started with `background: true`, read, listed
 * and discarded by the user. Each works on no connection of the instance
 * (`connectionless`): the strategy keeps the runs, and the caller is
 * resolved from the request.
 */
export function backgroundRunEntries(): HandlerEntry[] {
  return [
    defineTool(GetBackgroundRun_Tool, handleGetBackgroundRun),
    defineTool(ListBackgroundRuns_Tool, handleListBackgroundRuns),
    defineTool(DiscardBackgroundRun_Tool, handleDiscardBackgroundRun),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class BackgroundRunHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'BackgroundRunHandlers';

  getHandlers(): HandlerEntry[] {
    return backgroundRunEntries();
  }
}
