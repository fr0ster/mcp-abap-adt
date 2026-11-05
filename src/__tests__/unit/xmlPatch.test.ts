import { corpusBody } from '../../lib/adtCorpus';
import { patchDomainXml } from '../../lib/strategies/domainPatch';
import { patchTableTypeXml } from '../../lib/strategies/tableTypePatch';
import {
  patchXmlAttribute,
  patchXmlBlock,
  patchXmlElement,
  patchXmlElementAttribute,
  XmlPatchError,
} from '../../lib/strategies/xmlPatch';

/** A value carrying each replacement pattern String.prototype.replace reads. */
const PATTERNS = ['$&', '$1', '$$', '$`', "$'"];
const VALUES = PATTERNS.map((p) => `Price ${p} and ${p}`);

/** What the helpers write for a value in text: XML-escaped, nothing else. */
const ESCAPED: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
};
const esc = (v: string): string => {
  let out = '';
  for (const char of v) out += ESCAPED[char] ?? char;
  return out;
};
/**
 * In an attribute value the apostrophe too: the document is built back with
 * fast-xml-parser's builder, which writes both quotes as entities there.
 */
const escAttr = (v: string): string => {
  let out = '';
  for (const char of v)
    out += char === "'" ? '&apos;' : (ESCAPED[char] ?? char);
  return out;
};

const XML = '<r a="old"><t>old</t><e x="old" y="keep"/><b><i>old</i></b></r>';

describe('a patched value is written as given, whatever $ patterns it holds', () => {
  it.each(VALUES)('patchXmlAttribute writes %s literally', (v) => {
    expect(patchXmlAttribute(XML, 'a', v)).toBe(
      XML.replace('a="old"', () => `a="${escAttr(v)}"`),
    );
  });

  it.each(VALUES)('patchXmlElement writes %s literally', (v) => {
    expect(patchXmlElement(XML, 't', v)).toBe(
      XML.replace('<t>old</t>', () => `<t>${esc(v)}</t>`),
    );
  });

  it.each(VALUES)('patchXmlElementAttribute writes %s literally', (v) => {
    expect(patchXmlElementAttribute(XML, 'e', 'x', v)).toBe(
      XML.replace('x="old"', () => `x="${escAttr(v)}"`),
    );
  });

  it.each(VALUES)('patchXmlElementAttribute adds %s literally', (v) => {
    expect(patchXmlElementAttribute(XML, 'e', 'z', v)).toBe(
      XML.replace('y="keep"/>', () => `y="keep" z="${escAttr(v)}"/>`),
    );
  });

  it.each(VALUES)('patchXmlBlock writes %s literally', (v) => {
    const block = `<b>${v}</b>`; // a block is the caller's markup, written as is
    expect(patchXmlBlock(XML, 'b', block)).toBe(
      XML.replace('<b><i>old</i></b>', () => block),
    );
  });

  it.each(VALUES)('patchDomainXml writes %s literally', (v) => {
    const domain =
      '<doma:domain adtcore:description="before" adtcore:name="D"><doma:length>10</doma:length></doma:domain>';
    expect(patchDomainXml(domain, { description: v })).toBe(
      domain.replace('"before"', () => `"${escAttr(v)}"`),
    );
  });

  it.each(VALUES)('patchTableTypeXml writes %s literally', (v) => {
    const doc = corpusBody(
      'read-metadata-table-type--01-tabletypes-string_table',
    );
    const from = 'adtcore:description="Tabelle von Strings"';
    expect(doc).toContain(from);
    expect(patchTableTypeXml(doc, { description: v })).toBe(
      doc.replace(from, () => `adtcore:description="${escAttr(v)}"`),
    );
  });
});

/**
 * A patch reads the document with the XML parser, changes the value in the
 * structure and builds the document back (`xml/ordered`): the recorded
 * documents come back as recorded but for the value changed, and what a text
 * search mishandled — a quoted attribute, CDATA, a comment, a `>` inside an
 * attribute value — is patched as XML says.
 */
describe('a patch through the XML parser', () => {
  const DOMAIN = corpusBody('create-domain--01-ddic-domains');

  it('the recorded domain: description, datatype and length changed, the rest as recorded', () => {
    const out = patchDomainXml(DOMAIN, {
      description: 'after',
      datatype: 'CHAR',
      length: 20,
    });
    expect(out).toBe(
      DOMAIN.replace(
        'adtcore:description="corpus create capture (safe to delete)"',
        'adtcore:description="after"',
      )
        .replace('<doma:datatype/>', '<doma:datatype>CHAR</doma:datatype>')
        .replace(
          '<doma:length>000000</doma:length>',
          '<doma:length>20</doma:length>',
        ),
    );
  });

  it('the recorded domain: a value table added to the reference that has none', () => {
    const out = patchDomainXml(DOMAIN, { value_table: 'T000' });
    expect(DOMAIN).toContain('<doma:valueTableRef/>');
    expect(out).toBe(
      DOMAIN.replace(
        '<doma:valueTableRef/>',
        '<doma:valueTableRef adtcore:name="T000"/>',
      ),
    );
  });

  it('patches an attribute quoted with apostrophes', () => {
    expect(patchXmlAttribute("<r a='old'><t>x</t></r>", 'a', 'new')).toBe(
      '<r a="new"><t>x</t></r>',
    );
  });

  it('patches the attribute of an element, not words in a comment', () => {
    expect(
      patchXmlAttribute('<r><!-- a="note" --><e a="old"/></r>', 'a', 'new'),
    ).toBe('<r><!-- a="note" --><e a="new"/></r>');
  });

  it('patches an element whose text is CDATA', () => {
    expect(patchXmlElement('<r><t><![CDATA[old]]></t></r>', 't', 'new')).toBe(
      '<r><t>new</t></r>',
    );
  });

  it("adds an attribute to an element whose attribute value holds '>'", () => {
    expect(
      patchXmlElementAttribute('<r><e note="a>b"/></r>', 'e', 'z', 'v'),
    ).toBe('<r><e note="a>b" z="v"/></r>');
  });

  it('replaces a block whose CDATA holds its own closing tag', () => {
    expect(
      patchXmlBlock(
        '<r><b><![CDATA[</b>]]><i/></b><c/></r>',
        'b',
        '<b><n>1</n></b>',
      ),
    ).toBe('<r><b><n>1</n></b><c/></r>');
  });

  it('refuses a patch whose target is not in the document', () => {
    expect(() => patchXmlAttribute('<r/>', 'a', 'x')).toThrow(XmlPatchError);
    expect(() => patchXmlElement('<r/>', 't', 'x')).toThrow(XmlPatchError);
    expect(() => patchXmlElementAttribute('<r/>', 'e', 'z', 'x')).toThrow(
      XmlPatchError,
    );
    expect(() => patchXmlBlock('<r/>', 'b', '<b/>')).toThrow(XmlPatchError);
    expect(() => patchXmlAttribute('', 'a', 'x')).toThrow(XmlPatchError);
  });
});
