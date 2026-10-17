/**
 * The compact background-run tools, served beside compact's run tool
 * (`HandlerProfileRun`, in the compact write binaries): a run started with `background: true`,
 * read, listed and discarded by the user. Each works on no connection of the
 * instance (`connectionless`).
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerEntry,
} from '../../handlers/index';
import {
  TOOL_DEFINITION as HandlerBackgroundRunDiscard_Tool,
  handleHandlerBackgroundRunDiscard,
} from './handleHandlerBackgroundRunDiscard';
import {
  TOOL_DEFINITION as HandlerBackgroundRunGet_Tool,
  handleHandlerBackgroundRunGet,
} from './handleHandlerBackgroundRunGet';
import {
  TOOL_DEFINITION as HandlerBackgroundRunList_Tool,
  handleHandlerBackgroundRunList,
} from './handleHandlerBackgroundRunList';

export function compactBackgroundRunEntries(): HandlerEntry[] {
  return [
    defineTool(HandlerBackgroundRunGet_Tool, handleHandlerBackgroundRunGet),
    defineTool(HandlerBackgroundRunList_Tool, handleHandlerBackgroundRunList),
    defineTool(
      HandlerBackgroundRunDiscard_Tool,
      handleHandlerBackgroundRunDiscard,
    ),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class CompactBackgroundRunHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactBackgroundRunHandlers';

  getHandlers(): HandlerEntry[] {
    return compactBackgroundRunEntries();
  }
}
