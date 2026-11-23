/**
 * The detail mechanism every handler shares: `./levels` maps each level of
 * `detail` to the reading passed into the adt-clients member (selected before
 * the call), `./tsv` writes the terse list format, `./wire` answers
 * `raw` as what ADT sent, and `./listing` writes every terse and medium
 * list from the reading's own lists, complete by construction.
 */

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
  type ListAnswerTable,
  type ListDetailTable,
  listAnswerAt,
  rawLevel,
  readingAt,
  structuredValue,
  type WrittenLevel,
  whole,
  written,
} from './levels';
export {
  asContentResult,
  asJsonResult,
  asTextResult,
  type Bound,
  bullets,
  type Column,
  entries,
  type Group,
  type Head,
  type JsonBound,
  type JsonSchemas,
  jsonText,
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
  shownBeside,
  type TextResult,
  values,
  Written,
  writeJson,
  writeJsonList,
  writeJsonRoot,
  writeListing,
  writeWhole,
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
