/**
 * The detail mechanism every handler shares: `./levels` maps each level of
 * `detail` to the reading passed into the adt-clients member (selected before
 * the call), `./tsv` writes the terse list format, `./wire` answers
 * `raw` as what ADT sent, and `./complete` refuses an answer that does not
 * hold every item its reading held.
 */

export {
  completeAnswer,
  IncompleteAnswerError,
  identityOf,
  incompleteAnswerWords,
  type Line,
  type ListedPart,
  listedText,
  type TextKey,
  Written,
} from './complete';
export {
  type AnswerTable,
  answerAt,
  answered,
  DETAIL_LEVELS,
  type DetailLevel,
  type DetailTable,
  formatted,
  fullLevel,
  type LevelReading,
  rawLevel,
  readingAt,
  structuredValue,
} from './levels';
export {
  type Bound,
  type Column,
  entries,
  type Group,
  type Head,
  type JsonBound,
  type JsonSchemas,
  type KindSpec,
  kinds,
  type Listing,
  type ListKeys,
  marks,
  type Nested,
  nest,
  type Omitting,
  omitted,
  omitting,
  parts,
  type Root,
  type RowSchemas,
  type RowSpec,
  rows,
  sections,
  writeJson,
  writeJsonList,
  writeJsonRoot,
  writeListing,
} from './listing';
export { cellsOf } from './tsvCells';
export {
  notOneDocumentWords,
  partStatuses,
  recordedBody,
  recordedWire,
  type WireOf,
  type WireResponse,
  type WireShape,
  wireAnswer,
  wireText,
} from './wire';
