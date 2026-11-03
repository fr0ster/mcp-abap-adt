/**
 * `HandlerGet`'s `timeout` says which reads take it. Every call of the tool
 * runs on the long path (an ABAP session of its own) but a unit-test run's
 * result (`UNIT_TEST`, `CDS_UNIT_TEST`) and an activation run's parts
 * (`isLongRead`), so the sentence names every other member.
 */
import { COMPACT_READ } from '../../lib/adtProjections';
import { compactGetSchemaFor } from '../../lib/compact/compactSchemas';
import { isLongRead } from '../../lib/longTools';
import { jsonAt, listedJson } from '../helpers/listedJson';

/** `word` stands after a space or a colon and before a comma or a period. */
function namedInList(words: string, word: string): boolean {
  let at = words.indexOf(word);
  while (at !== -1) {
    const before = words.charAt(at - 1);
    const after = words.charAt(at + word.length);
    if ((before === ' ' || before === ':') && (after === ',' || after === '.'))
      return true;
    at = words.indexOf(word, at + 1);
  }
  return false;
}

describe("HandlerGet's timeout names the reads that take it", () => {
  const words =
    jsonAt(listedJson(compactGetSchemaFor(COMPACT_READ.onprem)), 'timeout')
      .description ?? '';
  const reads = COMPACT_READ.onprem.filter((member) =>
    isLongRead('HandlerGet', { object_type: member }),
  );

  it.each(reads)('names %s', (member) => {
    expect(namedInList(words, member)).toBe(true);
  });

  it('names no run mode', () => {
    expect(namedInList(words, 'UNIT_TEST')).toBe(false);
    expect(words.includes('CDS_UNIT_TEST')).toBe(false);
  });
});
