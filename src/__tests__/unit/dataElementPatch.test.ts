import { corpusBody } from '../../lib/adtCorpus';
import { patchDataElementXml } from '../../lib/strategies/dataElementPatch';

/**
 * `patchDataElementXml`'s own test, standalone from any handler.
 *
 * The description half runs against a real captured document —
 * `create-dataelement--01-ddic-dataelements`, the one genuine data-element
 * document in the corpus (a create response, but `verbatim` the same as a
 * metadata read per `resultSets.ts`, and `adtcore:description` is unprefixed
 * so the root element's namespace alias does not matter to it).
 *
 * The element-level fields (`type_kind`, `type_name`, the labels, …) stay
 * unverified: that document has no populated children to patch, and its root
 * binds the `dtel` namespace to the alias `blue`, not `dtel` — the alias
 * `patchDataElementXml` hardcodes for every one of those fields. See
 * `dataElementPatch.ts`'s own doc comment for what that would mean and why
 * it cannot be proven wrong from what is captured today. A hand-written
 * stand-in populated document would be this repository asserting against its
 * own imagination rather than a captured SAP response — the discipline
 * `task-22-brief.md` spells out — so the element-level half stays an
 * `it.todo` instead.
 */
describe('patching a data element changes what was asked and nothing else', () => {
  it('changes the description against the real captured document, and keeps everything else', () => {
    const before = corpusBody('create-dataelement--01-ddic-dataelements');
    const after = patchDataElementXml(before, { description: 'New text' });
    expect(after).toContain('adtcore:description="New text"');
    for (const attr of before.match(/\b[\w:]+="[^"]*"/g) ?? []) {
      if (!attr.startsWith('adtcore:description='))
        expect(after).toContain(attr);
    }
  });

  it('throws rather than writing a document it could not patch', () => {
    expect(() => patchDataElementXml('', { description: 'x' })).toThrow();
    expect(() =>
      patchDataElementXml('<other/>', { description: 'x' }),
    ).toThrow();
  });
});

it.todo(
  'keeps every unnamed element-level field — unverified: the only real ' +
    'data-element document in the corpus has no populated children, and its ' +
    'root binds the dtel namespace to a different alias (blue) than the ' +
    'hardcoded dtel: prefix these patches match against',
);
