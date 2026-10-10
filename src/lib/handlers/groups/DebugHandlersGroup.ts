import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type { HandlerEntry } from '../interfaces.js';

/**
 * The debugger tools — opt-in (`--exposition=…,debug`): a breakpoint catches
 * every request of the connected SAP user. Their state lives in the server
 * instance (`HandlerContext.debugger`).
 */
export class DebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DebugHandlers';

  getHandlers(): HandlerEntry[] {
    return [];
  }
}
