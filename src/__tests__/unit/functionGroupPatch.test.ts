import { corpusBody } from '../../lib/adtCorpus';
import { patchFunctionGroupXml } from '../../lib/strategies/functionGroupPatch';

/**
 * `patchFunctionGroupXml`'s own test, standalone from any handler — proves
 * the patch against the real corpus document, not a hand-written stand-in.
 * `highTierWriteChannel.test.ts` separately proves `UpdateFunctionGroup`
 * wires this in through `options.source`, via a `withLock`-held sequence;
 * this file proves only what the function itself does to bytes.
 */
describe('patching a function group changes what was asked and nothing else', () => {
  it('changes the description and keeps everything else', () => {
    const before = corpusBody(
      'read-metadata-function-group--01-groups-zmcpshrfgrp',
    );
    const after = patchFunctionGroupXml(before, { description: 'New text' });
    expect(after).toContain('adtcore:description="New text"');
    for (const attr of before.match(/\b[\w:]+="[^"]*"/g) ?? []) {
      if (!attr.startsWith('adtcore:description='))
        expect(after).toContain(attr);
    }
  });

  it("truncates a description at 40, matching the corpus fixture's own descriptionTextLimit", () => {
    const before = corpusBody(
      'read-metadata-function-group--01-groups-zmcpshrfgrp',
    );
    expect(before).toContain('adtcore:descriptionTextLimit="40"');
    const long = 'x'.repeat(80);
    const after = patchFunctionGroupXml(before, { description: long });
    expect(after).toContain(`adtcore:description="${'x'.repeat(40)}"`);
  });

  it('leaves the document untouched when no change is named', () => {
    const before = corpusBody(
      'read-metadata-function-group--01-groups-zmcpshrfgrp',
    );
    expect(patchFunctionGroupXml(before, {})).toBe(before);
  });

  it('throws rather than writing a document it could not patch', () => {
    expect(() => patchFunctionGroupXml('', { description: 'x' })).toThrow();
    expect(() =>
      patchFunctionGroupXml('<other/>', { description: 'x' }),
    ).toThrow();
  });
});
