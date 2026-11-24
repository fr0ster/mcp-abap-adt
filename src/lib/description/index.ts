/**
 * Tool descriptions by construction (plan step 10): a purpose sentence, the
 * facts of what a tool gives back generated from its writers' schemas, and
 * the shared notes. See `toolDescription`.
 */

export { batchable, longRunning, type Note } from './notes';
export { type Purpose, purpose } from './purpose';
export { type ReaderParts, readerParts } from './readers';
export {
  type EachNouns,
  type MemberNoun,
  type MemberNouns,
  membersOf,
  type ReturnsFact,
  returnsOf,
  sapData,
} from './returns';
export {
  type DescriptionParts,
  type DescriptionTag,
  partsOfDescription,
  toolDescription,
} from './toolDescription';
