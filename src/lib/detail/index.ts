/**
 * The detail mechanism every handler shares: `./levels` maps each level of
 * `detail` to the reading passed into the adt-clients member (selected before
 * the call), and `./tsv` writes the terse list format.
 */

export {
  answered,
  type DetailLevel,
  type DetailTable,
  formatted,
  fullLevel,
  type LevelReading,
  rawLevel,
  readingAt,
} from './levels';
export { groupedTsv, type TsvGroup, tsv } from './tsv';
