import { corpusBody } from '../../lib/adtCorpus';
import { patchPackageXml } from '../../lib/strategies/packagePatch';

/**
 * `patchPackageXml`'s own test, standalone from any handler — proves the
 * patch against the real corpus document, not a hand-written stand-in.
 * `lowTierStrategies.test.ts` and `highTierWriteChannel.test.ts` separately
 * prove `UpdatePackageLow` wires this in through `config.document`; this file
 * proves only what the function itself does to bytes.
 */
describe('patching a package changes what was asked and nothing else', () => {
  it('changes the description and keeps everything else', () => {
    const before = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
    const after = patchPackageXml(before, { description: 'New text' });
    expect(after).toContain('adtcore:description="New text"');
    for (const attr of before.match(/\b[\w:]+="[^"]*"/g) ?? []) {
      if (!attr.startsWith('adtcore:description='))
        expect(after).toContain(attr);
    }
  });

  it('changes only the fields named', () => {
    const before = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
    const after = patchPackageXml(before, { responsible: 'DEVELOPER1' });
    expect(after).toContain('adtcore:responsible="DEVELOPER1"');
    // the description nobody named is still the one the corpus carries
    const originalDescription = before.match(
      /adtcore:description="([^"]*)"/,
    )?.[1];
    expect(after).toContain(`adtcore:description="${originalDescription}"`);
  });

  it('truncates a description at 60, the way ADT does', () => {
    const before = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
    const long = 'x'.repeat(80);
    const after = patchPackageXml(before, { description: long });
    expect(after).toContain(`adtcore:description="${'x'.repeat(60)}"`);
  });

  it('throws rather than writing a document it could not patch', () => {
    expect(() => patchPackageXml('', { description: 'x' })).toThrow();
    expect(() => patchPackageXml('<other/>', { description: 'x' })).toThrow();
  });
});
