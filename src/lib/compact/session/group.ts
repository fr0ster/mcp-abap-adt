/**
 * The compact leftover-session tools, served beside every compact
 * exposition — the resume only beside `rw`: the SAP sessions an ended
 * process left open, listed, resumed or logged off by the user. Each works on no connection of the instance
 * (`connectionless`).
 */
import type { LeftoverSessionToolsOptions } from '../../handlers/groups/LeftoverSessionHandlersGroup';
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
import {
  TOOL_DEFINITION as HandlerLeftoverSessionResume_Tool,
  handleHandlerLeftoverSessionResume,
} from './handleHandlerLeftoverSessionResume';

export function compactLeftoverSessionEntries(
  options: LeftoverSessionToolsOptions = {},
): HandlerEntry[] {
  return [
    defineTool(
      HandlerLeftoverSessionList_Tool,
      handleHandlerLeftoverSessionList,
    ),
    ...(options.resume === false
      ? []
      : [
          defineTool(
            HandlerLeftoverSessionResume_Tool,
            handleHandlerLeftoverSessionResume,
          ),
        ]),
    defineTool(
      HandlerLeftoverSessionLogoff_Tool,
      handleHandlerLeftoverSessionLogoff,
    ),
  ].map((entry) => ({ ...entry, connectionless: true as const }));
}

export class CompactLeftoverSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactLeftoverSessionHandlers';

  constructor(
    context: HandlerContext,
    private readonly options: LeftoverSessionToolsOptions = {},
  ) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return compactLeftoverSessionEntries(this.options);
  }
}
