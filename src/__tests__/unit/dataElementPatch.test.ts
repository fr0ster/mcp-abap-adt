import { patchDataElementXml } from '../../lib/strategies/dataElementPatch';

/**
 * `patchDataElementXml`'s own test, standalone from any handler.
 *
 * Only the half that needs no document: the corpus has no data-element
 * metadata read (`read-metadata-data-element--*`), and a stand-in document
 * here would be this repository asserting against its own imagination
 * rather than a captured SAP response — the discipline `task-22-brief.md`
 * spells out. `lowTierStrategies.test.ts` and `highTierWriteChannel.test.ts`
 * separately prove `UpdateDataElementLow`/`UpdateDataElement` wire this
 * function's output into `config.document`, against hand-written documents
 * carrying the same `dtel:`-tagged shape this patcher expects.
 */
describe('a read that came back empty is refused, not written back', () => {
  it('throws rather than writing a document it could not patch', () => {
    expect(() => patchDataElementXml('', { description: 'x' })).toThrow();
    expect(() =>
      patchDataElementXml('<other/>', { description: 'x' }),
    ).toThrow();
  });
});

it.todo(
  'keeps every unnamed field — unverified: no data-element metadata in the corpus',
);
