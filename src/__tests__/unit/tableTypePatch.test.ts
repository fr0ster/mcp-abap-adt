import { patchTableTypeXml } from '../../lib/strategies/tableTypePatch';

/**
 * `patchTableTypeXml`'s own test, standalone — and unlike its three siblings
 * in this task, standalone from any handler too: this repository wires no
 * tool to `AdtDdicTableType` yet (see `tableTypePatch.ts`'s own doc comment),
 * so there is no `UpdateTableType`/`UpdateTableTypeLow` mocked-channel test
 * to point to the way `functionGroupPatch.test.ts` points to
 * `highTierWriteChannel.test.ts`.
 *
 * Only the half that needs no document: the corpus has no table-type
 * metadata read (`read-metadata-tabletype--*`), and a stand-in document here
 * would be this repository asserting against its own imagination rather than
 * a captured SAP response — the discipline `task-22-brief.md` spells out.
 */
describe('a read that came back empty is refused, not written back', () => {
  it('throws rather than writing a document it could not patch', () => {
    expect(() => patchTableTypeXml('', { description: 'x' })).toThrow();
    expect(() => patchTableTypeXml('<other/>', { description: 'x' })).toThrow();
  });
});

it.todo(
  'keeps every unnamed field — unverified: no table-type metadata in the corpus',
);
