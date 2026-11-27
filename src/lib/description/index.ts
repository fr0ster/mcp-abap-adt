/**
 * Tool descriptions by construction (plan step 10): a tag, a purpose
 * sentence and the shared notes — the function alone. See `toolDescription`.
 */

export {
  assembledParts,
  compactOf,
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
  lockAnswersStateHandle,
  longRunning,
  type Note,
  sapRowBound,
  stateHandleAnswered,
  underLock,
  unlockUnderLock,
} from './notes';
export {
  type Purpose,
  pairsPurpose,
  purpose,
  withArticle,
} from './purpose';
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
} from './toolDescription';
