/**
 * The batch tools: served while a batch is open, never recorded. Every other
 * tool, while a batch is open, is recorded when the open batch admits it, and
 * refused otherwise.
 */
export const BATCH_TOOLS: readonly string[] = [
  'BatchBegin',
  'BatchEnd',
  'BatchAnswers',
  'DebugBatchBegin',
  'DebugBatchEnd',
  'HandlerBatch',
  'HandlerDebugBatch',
];

const LISTED = new Set(BATCH_TOOLS);

/** Whether `tool` is one of the batch tools. */
export function isBatchTool(tool: string): boolean {
  return LISTED.has(tool);
}
