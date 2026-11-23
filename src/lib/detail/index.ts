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
  type ItemGroup,
  type ItemRow,
  incompleteAnswerWords,
  type TreeItemRow,
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
  groupedTsv,
  indentedTsv,
  type TreeRow,
  type TsvGroup,
  tsv,
  tsvRow,
} from './tsv';
export {
  notOneDocumentWords,
  recordedBody,
  recordedWire,
  type WireOf,
  type WireShape,
  wireAnswer,
  wireText,
} from './wire';
