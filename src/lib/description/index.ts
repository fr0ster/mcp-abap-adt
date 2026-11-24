/**
 * Tool descriptions by construction (plan step 10): a purpose sentence, the
 * facts of what a tool gives back generated from its writers' schemas, and
 * the shared notes. See `toolDescription`.
 */

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
export { batchable, longRunning, type Note } from './notes';
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
  partsOfDescription,
  toolDescription,
} from './toolDescription';
