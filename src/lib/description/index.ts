/**
 * Tool descriptions by construction (plan step 10): a tag, a purpose
 * sentence and the shared notes — the function alone. See `toolDescription`.
 */

export {
  assembledParts,
  compactOf,
  valueFrom,
  valueParts,
} from './compact';
export {
  activateTool,
  checkTool,
  createTool,
  deleteTool,
  type KindTool,
  updateTool,
  validateTool,
  type WriteTool,
} from './kinds';
export {
  batchable,
  longRunning,
  type Note,
  stateHandleAnswered,
  underLock,
} from './notes';
export { type Purpose, purpose, typesPurpose } from './purpose';
export { type ReaderParts, readerParts } from './readers';
export {
  type SourceReader,
  sourceReader,
  versionHistoryReader,
  versionSourceReader,
} from './sourceReader';
export {
  type DescriptionParts,
  type DescriptionTag,
  partsOfDescription,
  toolDescription,
  type ValueParts,
  type ValuesParts,
} from './toolDescription';
