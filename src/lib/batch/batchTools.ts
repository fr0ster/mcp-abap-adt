import type { BatchKind } from './InstanceBatch';

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

/** Whether `args` ask for numbers: `number` or `numbers` given. */
export function asksNumbers(args: unknown): boolean {
  if (args === null || typeof args !== 'object') return false;
  const given = args as { number?: unknown; numbers?: unknown };
  return given.number !== undefined || given.numbers !== undefined;
}

/** Whether `args` name `action: 'end'` and ask for no numbers. */
function endAction(args: unknown): boolean {
  return (
    args !== null &&
    typeof args === 'object' &&
    (args as { action?: unknown }).action === 'end' &&
    !asksNumbers(args)
  );
}

/**
 * Which batch a call of `tool` with `args` ends: the communication batch
 * (`BatchEnd`, `HandlerBatch` with `action: 'end'`), the debugger batch
 * (`DebugBatchEnd`, `HandlerDebugBatch` with `action: 'end'`), or none. Its
 * failure before `execute()` ends that batch (`endBeforeExecute`).
 */
export function endsBatch(tool: string, args: unknown): BatchKind | undefined {
  if (tool === 'BatchEnd') return 'communication';
  if (tool === 'DebugBatchEnd') return 'debugger';
  if (tool === 'HandlerBatch' && endAction(args)) return 'communication';
  if (tool === 'HandlerDebugBatch' && endAction(args)) return 'debugger';
  return undefined;
}

/** Whether a call of `tool` with `args` ends the communication batch. */
export function endsCommunicationBatch(tool: string, args: unknown): boolean {
  return endsBatch(tool, args) === 'communication';
}
