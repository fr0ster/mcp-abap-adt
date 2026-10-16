/**
 * Batch mode in the full sets (`fullToolSet`, `fullReadOnlyToolSet`, every
 * transport): `BatchBegin`, `BatchEnd`, `BatchAnswers`. `BatchBegin` and
 * `BatchAnswers` work on no connection of the instance (`connectionless`);
 * `BatchEnd` takes the instance's connection in its turn and sends the
 * recorded calls on it. No batch tool takes a `state_handle`: over HTTP the
 * handle travels in the request header.
 */
import {
  TOOL_DEFINITION as BatchAnswers_Tool,
  handleBatchAnswers,
} from '../../../handlers/batch/batch/handleBatchAnswers';
import {
  TOOL_DEFINITION as BatchBegin_Tool,
  handleBatchBegin,
} from '../../../handlers/batch/batch/handleBatchBegin';
import {
  TOOL_DEFINITION as BatchEnd_Tool,
  handleBatchEnd,
} from '../../../handlers/batch/batch/handleBatchEnd';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../interfaces.js';

/**
 * The three tools; each handler takes `(context, args)`, so every registration
 * path hands it the call's context (the owner is `context.batch`).
 */
export function batchToolEntries(): HandlerEntry[] {
  return [
    {
      ...defineTool(BatchBegin_Tool, handleBatchBegin),
      connectionless: true as const,
    },
    defineTool(BatchEnd_Tool, handleBatchEnd),
    {
      ...defineTool(BatchAnswers_Tool, handleBatchAnswers),
      connectionless: true as const,
    },
  ];
}

export class BatchHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'BatchHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return batchToolEntries();
  }
}
