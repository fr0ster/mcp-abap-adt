/**
 * The debugger batch in the full set (`fullToolSet` only, every transport):
 * `DebugBatchBegin`, `DebugBatchEnd`. Both work on the debugger's
 * connection — the ABAP stop's — and are listed in
 * `DEBUGGER_OWN_CONNECTION_TOOLS`; the answers are read with `BatchAnswers`.
 * No tool takes a `state_handle`.
 */
import {
  TOOL_DEFINITION as DebugBatchBegin_Tool,
  handleDebugBatchBegin,
} from '../../../handlers/debugger/debug/handleDebugBatchBegin';
import {
  TOOL_DEFINITION as DebugBatchEnd_Tool,
  handleDebugBatchEnd,
} from '../../../handlers/debugger/debug/handleDebugBatchEnd';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

/** The two tools; each handler takes `(context, args)`. */
export function debugBatchToolEntries(): HandlerEntry[] {
  return [
    defineTool(DebugBatchBegin_Tool, handleDebugBatchBegin),
    defineTool(DebugBatchEnd_Tool, handleDebugBatchEnd),
  ];
}

export class DebugBatchHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DebugBatchHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return debugBatchToolEntries();
  }
}
