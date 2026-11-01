/**
 * `HandlerGet`'s `timeout` says which reads take it. Every call of the tool
 * runs on the long path (an ABAP session of its own) but a unit-test run's
 * result (`UNIT_TEST`, `CDS_UNIT_TEST`) and an activation run's parts
 * (`isLongRead`), so the sentence names every other member.
 */
import { COMPACT_READ } from '../../lib/adtProjections';
import { compactGetSchemaFor } from '../../lib/compact/compactSchemas';
import { isLongRead } from '../../lib/longTools';

describe("HandlerGet's timeout names the reads that take it", () => {
  const words = compactGetSchemaFor(COMPACT_READ.onprem).properties.timeout
    .description;
  const reads = COMPACT_READ.onprem.filter((member) =>
    isLongRead('HandlerGet', { object_type: member }),
  );

  it.each(reads)('names %s', (member) => {
    expect(words).toMatch(new RegExp(`[ :]${member}[,.]`));
  });

  it('names no run mode', () => {
    expect(words).not.toMatch(/[ :]UNIT_TEST[,.]/);
    expect(words).not.toMatch(/CDS_UNIT_TEST/);
  });
});
