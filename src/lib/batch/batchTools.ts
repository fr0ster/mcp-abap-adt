import { child } from '../xml/tree';
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

/**
 * The long-session tools (Streamable HTTP, #308 spec §2): served while a
 * batch is open, at once, never recorded — as the batch tools — and the
 * batch stays open.
 */
export const LONG_SESSION_TOOLS: readonly string[] = [
  'SessionOpen',
  'SessionClose',
  'HandlerSession',
];

const SESSION_LISTED = new Set(LONG_SESSION_TOOLS);

/**
 * Whether a call of `tool` runs beside an open batch — at once, never
 * recorded, its description carrying no batch sentence: a batch tool or a
 * long-session tool.
 */
export function runsBesideBatch(tool: string): boolean {
  return LISTED.has(tool) || SESSION_LISTED.has(tool);
}

/** What a batch tool's parsed arguments say of the numbers asked. */
export interface NumberArgs {
  readonly number?: number | undefined;
  readonly numbers?: readonly number[] | undefined;
}

/** Whether `args` ask for numbers: `number` or `numbers` given. */
export function asksNumbers(args: NumberArgs): boolean {
  return args.number !== undefined || args.numbers !== undefined;
}

/**
 * Whether a call's arguments, as the SDK hands them before the tool's
 * schema, name `action: 'end'` and ask for no numbers.
 */
function endAction(args: unknown): boolean {
  return (
    child(args, 'action') === 'end' &&
    child(args, 'number') === undefined &&
    child(args, 'numbers') === undefined
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
