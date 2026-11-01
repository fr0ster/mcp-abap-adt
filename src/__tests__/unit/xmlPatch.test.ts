import { corpusBody } from '../../lib/adtCorpus';
import { patchDomainXml } from '../../lib/strategies/domainPatch';
import { patchTableTypeXml } from '../../lib/strategies/tableTypePatch';
import {
  patchXmlAttribute,
  patchXmlBlock,
  patchXmlElement,
  patchXmlElementAttribute,
} from '../../lib/strategies/xmlPatch';

/** A value carrying each replacement pattern String.prototype.replace reads. */
const PATTERNS = ['$&', '$1', '$$', '$`', "$'"];
const VALUES = PATTERNS.map((p) => `Price ${p} and ${p}`);

/** What the helpers write for a value: XML-escaped, nothing else. */
const esc = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const XML = '<r a="old"><t>old</t><e x="old" y="keep"/><b><i>old</i></b></r>';

describe('a patched value is written as given, whatever $ patterns it holds', () => {
  it.each(VALUES)('patchXmlAttribute writes %s literally', (v) => {
    expect(patchXmlAttribute(XML, 'a', v)).toBe(
      XML.replace('a="old"', () => `a="${esc(v)}"`),
    );
  });

  it.each(VALUES)('patchXmlElement writes %s literally', (v) => {
    expect(patchXmlElement(XML, 't', v)).toBe(
      XML.replace('<t>old</t>', () => `<t>${esc(v)}</t>`),
    );
  });

  it.each(VALUES)('patchXmlElementAttribute writes %s literally', (v) => {
    expect(patchXmlElementAttribute(XML, 'e', 'x', v)).toBe(
      XML.replace('x="old"', () => `x="${esc(v)}"`),
    );
  });

  it.each(VALUES)('patchXmlElementAttribute adds %s literally', (v) => {
    expect(patchXmlElementAttribute(XML, 'e', 'z', v)).toBe(
      XML.replace('y="keep"/>', () => `y="keep" z="${esc(v)}"/>`),
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
      domain.replace('"before"', () => `"${esc(v)}"`),
    );
  });

  it.each(VALUES)('patchTableTypeXml writes %s literally', (v) => {
    const doc = corpusBody(
      'read-metadata-table-type--01-tabletypes-string_table',
    );
    const from = 'adtcore:description="Tabelle von Strings"';
    expect(doc).toContain(from);
    expect(patchTableTypeXml(doc, { description: v })).toBe(
      doc.replace(from, () => `adtcore:description="${esc(v)}"`),
    );
  });
});
