/**
 * Tool descriptions by construction (plan step 10): a purpose sentence, the
 * facts of what a tool gives back generated from its writers' schemas, and
 * the shared notes. See `toolDescription`.
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
  namedCheckTool,
  updateTool,
  validateTool,
} from './kinds';
export { batchable, longRunning, type Note, underLock } from './notes';
export { type Purpose, purpose } from './purpose';
export { type ReaderParts, readerParts } from './readers';
export * as results from './results';
export {
  type EachNouns,
  type ListNouns,
  listOf,
  type MemberNoun,
  type MemberNouns,
  membersOf,
  type ResultNouns,
  type ResultShape,
  type ReturnsFact,
  resultReturns,
  resultShape,
  returnsOf,
  sapData,
  untypedReturns,
} from './returns';
export {
  type SourceReadAnswer,
  type SourceReader,
  sourceReader,
  type VersionSourceAnswer,
  versionHistoryReader,
  versionSourceReader,
} from './sourceReader';
export {
  type DescriptionParts,
  type DescriptionTag,
  type Members,
  membersTaken,
  partsOfDescription,
  toolDescription,
  type ValueParts,
  type ValuesParts,
} from './toolDescription';
