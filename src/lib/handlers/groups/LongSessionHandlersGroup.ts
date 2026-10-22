/**
 * The long session in the full sets (`fullToolSet`, `fullReadOnlyToolSet`),
 * served only on the Streamable HTTP binaries (#308, spec §2):
 * `SessionOpen` and `SessionClose`. They work on no connection of the
 * instance (`connectionless`), run at once while a batch is open and are
 * never recorded (`runsBesideBatch`).
 */
import {
  handleSessionClose,
  TOOL_DEFINITION as SessionClose_Tool,
} from '../../../handlers/long_session/session/handleSessionClose';
import {
  handleSessionOpen,
  TOOL_DEFINITION as SessionOpen_Tool,
} from '../../../handlers/long_session/session/handleSessionOpen';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

export function longSessionEntries(): HandlerEntry[] {
  return [
    {
      ...defineTool(SessionOpen_Tool, handleSessionOpen),
      connectionless: true as const,
    },
    {
      ...defineTool(SessionClose_Tool, handleSessionClose),
      connectionless: true as const,
    },
  ];
}

export class LongSessionHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'LongSessionHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return longSessionEntries();
  }
}
