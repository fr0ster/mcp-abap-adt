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
} from './kinds';
export { batchable, longRunning, type Note } from './notes';
export { type Purpose, purpose } from './purpose';
export * as results from './results';
export {
  type ListNouns,
  listOf,
  type ResultNouns,
  type ResultShape,
  type ReturnsFact,
  resultReturns,
  resultShape,
  returnsOf,
  untypedReturns,
} from './returns';
export {
  type DescriptionParts,
  type DescriptionTag,
  partsOfDescription,
  toolDescription,
} from './toolDescription';
