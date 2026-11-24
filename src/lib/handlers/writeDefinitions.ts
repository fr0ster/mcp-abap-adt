/**
 * The definitions of the write tools a compact write tool does the work of,
 * by tool name: the compact tool states that tool's function in its
 * assembled parts. Write tools only: this module is part of the write barrel.
 */
import { TOOL_DEFINITION as RuntimeCreateProfilerTraceParameters } from '../../handlers/system/high/handleRuntimeCreateProfilerTraceParameters.js';
import { TOOL_DEFINITION as CreateTransport } from '../../handlers/transport/high/handleCreateTransport.js';
import { TOOL_DEFINITION as MoveTransportObjects } from '../../handlers/transport/high/handleMoveTransportObjects.js';
import { TOOL_DEFINITION as SortAndCompressTransportTask } from '../../handlers/transport/high/handleSortAndCompressTransportTask.js';

export const WRITE_DEFINITIONS = {
  CreateTransport,
  MoveTransportObjects,
  SortAndCompressTransportTask,
  RuntimeCreateProfilerTraceParameters,
} as const;
