/**
 * The long session in the full sets (`fullToolSet`, `fullReadOnlyToolSet`),
 * served only on the Streamable HTTP binaries (#308, spec §2):
 * `SessionOpen`. It works on no connection of the instance
 * (`connectionless`), runs at once while a batch is open and is never
 * recorded (`runsBesideBatch`).
 */
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
