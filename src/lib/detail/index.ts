/**
 * The detail mechanism every handler shares: `./levels` maps each level of
 * `detail` to the reading passed into the adt-clients member (selected before
 * the call), and `./tsv` writes the terse list format.
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
  rawLevel,
  readingAt,
  structuredValue,
} from './levels';
export { groupedTsv, type TsvGroup, tsv } from './tsv';
