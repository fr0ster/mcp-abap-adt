/**
 * Batch mode in the compact sets (`compactToolSetOf`,
 * `compactReadOnlyToolSetOf`, every transport): `HandlerBatch` alone, its
 * `action` begins, ends or answers. Connectionless for `begin` and
 * `answers` (`batchActionIsConnectionless`); `end` takes the instance's
 * connection.
 */
import {
  BaseHandlerGroup,
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../../handlers/index';
import {
  batchActionIsConnectionless,
  TOOL_DEFINITION as HandlerBatch_Tool,
  handleHandlerBatch,
} from './handleHandlerBatch';

export function compactBatchEntries(): HandlerEntry[] {
  return [
    {
      ...defineTool(HandlerBatch_Tool, handleHandlerBatch),
      connectionless: batchActionIsConnectionless,
    },
  ];
}

export class CompactBatchHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'CompactBatchHandlers';

  constructor(context: HandlerContext) {
    super(context);
  }

  getHandlers(): HandlerEntry[] {
    return compactBatchEntries();
  }
}
