import { patchDomainXml } from '../../lib/strategies/domainPatch';
import { extractXmlString, XmlPatchError } from '../../lib/strategies/xmlPatch';

/**
 * The merge adt-clients 19 stopped doing, done here.
 *
 * The document below is the shape ADT answers for a domain, including the
 * fields nobody here knows about — that is the point: they have to survive.
 */
const DOMAIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZMCP_D_TEST" adtcore:description="before" adtcore:version="active" abapLanguageVersion="standard" adtcore:masterLanguage="EN">
  <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="versions" rel="http://www.sap.com/adt/relations/versions"/>
  <doma:datatype>CHAR</doma:datatype>
  <doma:length>10</doma:length>
  <doma:decimals>0</doma:decimals>
  <doma:conversionExit/>
  <doma:signExists>false</doma:signExists>
  <doma:lowercase>false</doma:lowercase>
  <doma:valueTableRef/>
  <doma:fixValues/>
</doma:domain>`;

describe('patching a domain changes what was asked and nothing else', () => {
  it('changes the description and leaves the rest of the document alone', () => {
    const out = patchDomainXml(DOMAIN_XML, { description: 'after' });
    expect(out).toContain('adtcore:description="after"');
    // the fields nobody named are still there, which is the whole reason this
    // patches text rather than building a document from the caller's fields
    expect(out).toContain('abapLanguageVersion="standard"');
    expect(out).toContain('<doma:datatype>CHAR</doma:datatype>');
    expect(out).toContain('rel="http://www.sap.com/adt/relations/versions"');
  });

  it('changes only the elements named', () => {
    const out = patchDomainXml(DOMAIN_XML, { length: 20 });
    expect(out).toContain('<doma:length>20</doma:length>');
    expect(out).toContain('<doma:datatype>CHAR</doma:datatype>');
    expect(out).toContain('adtcore:description="before"');
  });

  it('sets a value table on an element that arrived without the attribute', () => {
    // `<doma:valueTableRef/>` is what ADT sends for a domain with none, so this
    // has to add the attribute rather than replace it.
    expect(DOMAIN_XML).toContain('<doma:valueTableRef/>');
    const out = patchDomainXml(DOMAIN_XML, { value_table: 'T000' });
    expect(out).toContain('adtcore:name="T000"');
  });

  it('replaces the fixed values whole, because they are a list', () => {
    const out = patchDomainXml(DOMAIN_XML, {
      fixed_values: [{ low: 'A', text: 'Alpha' }],
    });
    expect(out).toContain('<doma:low>A</doma:low>');
    expect(out).toContain('<doma:text>Alpha</doma:text>');
  });

  it('clears them when given an empty list', () => {
    const out = patchDomainXml(DOMAIN_XML, { fixed_values: [] });
    expect(out).toContain('<doma:fixValues/>');
  });

  it('truncates a description at 60, the way ADT does', () => {
    const long = 'x'.repeat(80);
    const out = patchDomainXml(DOMAIN_XML, { description: long });
    expect(out).toContain(`adtcore:description="${'x'.repeat(60)}"`);
  });

  it('escapes what would otherwise break the document', () => {
    const out = patchDomainXml(DOMAIN_XML, { description: 'a & b "c"' });
    expect(out).toContain('adtcore:description="a &amp; b &quot;c&quot;"');
  });
});

describe('a read that came back empty is refused, not written back', () => {
  it('throws rather than sending a document with nothing patched into it', () => {
    // ADT answers a read of a not-yet-ready object with 200 and no body, so
    // nothing upstream has a status to react to.
    expect(() => extractXmlString('', 'domain ZX')).toThrow(XmlPatchError);
    expect(() => extractXmlString('', 'domain ZX')).toThrow(/empty body/);
  });

  it('throws when the field to patch is not in the document', () => {
    expect(() =>
      patchDomainXml('<doma:domain/>', { description: 'x' }),
    ).toThrow(XmlPatchError);
  });

  it('names what it could not patch', () => {
    expect(() => patchDomainXml('<doma:domain/>', { length: 5 })).toThrow(
      /doma:length/,
    );
  });
});
