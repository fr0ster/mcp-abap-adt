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

  it("sets the data element's own description, not packageRef's, when the root has none yet", () => {
    // Measured live against E19 (RFC), 2026-09-21, GitHub #211: a fresh
    // data element's readMetadata answers with no adtcore:description on
    // the root at all, while the sibling packageRef carries the package's
    // own description. The unscoped patch used to match packageRef's
    // (the first occurrence in the string) and silently corrupt it while
    // leaving the data element's own description unset — which is what SAP
    // then rejected the PUT for, correctly, as "The description is missing".
    const before = corpusBody(
      'read-metadata-data-element--01-ddic-dataelements',
    );
    // Sanity: this fixture is exactly the shape that broke the old patch —
    // no description on the root, one on packageRef.
    expect(/<blue:wbobj\b[^>]*adtcore:description=/.test(before)).toBe(false);
    expect(before).toContain(
      '<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/zmcp_req_test" adtcore:type="DEVC/K" adtcore:name="ZMCP_REQ_TEST" adtcore:description="Request test"/>',
    );

    const after = patchDataElementXml(before, {
      description: 'issue 211 wire debug',
    });

    expect(after).toMatch(
      /<blue:wbobj\b[^>]*adtcore:description="issue 211 wire debug"/,
    );
    expect(after).toContain('adtcore:description="Request test"');
  });
});

it.todo(
  'keeps every unnamed element-level field — unverified: the only real ' +
    'data-element document in the corpus has no populated children, and its ' +
    'root binds the dtel namespace to a different alias (blue) than the ' +
    'hardcoded dtel: prefix these patches match against',
);
