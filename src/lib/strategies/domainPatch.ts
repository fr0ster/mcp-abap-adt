import {
  patchIf,
  patchXmlAttribute,
  patchXmlBlock,
  patchXmlElement,
  patchXmlElementAttribute,
} from './xmlPatch';

/**
 * ADT truncates a description at 60 characters, so this does too rather than
 * letting the server decide and answer about it.
 */
function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/** What a caller may change about a domain. Everything else is left alone. */
export interface DomainChanges {
  description?: string;
  datatype?: string;
  length?: number | string;
  decimals?: number | string;
  conversion_exit?: string;
  sign_exists?: boolean;
  lowercase?: boolean;
  value_table?: string;
  fixed_values?: Array<{ low: string; text: string }>;
}

/**
 * Patch a domain's own document with what the caller asked to change.
 *
 * Ported from what adt-clients did inside `updateDomain` until 19 removed it.
 * Only the fields named are touched; everything else in the document — the
 * language version, the links, whatever SAP keeps there — travels through
 * unread, which is the whole reason this patches text rather than building a
 * document from the caller's fields.
 */
export function patchDomainXml(
  currentXml: string,
  changes: DomainChanges,
): string {
  let xml = currentXml;

  if (changes.description) {
    xml = patchXmlAttribute(
      xml,
      'adtcore:description',
      limitDescription(changes.description),
    );
  }

  xml = patchIf(xml, changes.datatype, (x, v) =>
    patchXmlElement(x, 'doma:datatype', String(v)),
  );
  xml = patchIf(xml, changes.length, (x, v) =>
    patchXmlElement(x, 'doma:length', String(v)),
  );
  xml = patchIf(xml, changes.decimals, (x, v) =>
    patchXmlElement(x, 'doma:decimals', String(v)),
  );

  if (changes.conversion_exit !== undefined) {
    xml = patchXmlElement(
      xml,
      'doma:conversionExit',
      changes.conversion_exit || '',
    );
  }
  if (changes.sign_exists !== undefined) {
    xml = patchXmlElement(xml, 'doma:signExists', String(changes.sign_exists));
  }
  if (changes.lowercase !== undefined) {
    xml = patchXmlElement(xml, 'doma:lowercase', String(changes.lowercase));
  }

  // An unset reference arrives as `<doma:valueTableRef/>`, so the attribute is
  // added rather than replaced — see patchXmlElementAttribute.
  if (changes.value_table !== undefined) {
    xml = patchXmlElementAttribute(
      xml,
      'doma:valueTableRef',
      'adtcore:name',
      changes.value_table || '',
    );
  }

  // Fixed values are replaced whole: they are a list, and patching one entry of
  // a list the caller supplied in full would merge two intentions.
  if (changes.fixed_values !== undefined) {
    const block =
      changes.fixed_values && changes.fixed_values.length > 0
        ? `<doma:fixValues>\n${changes.fixed_values
            .map(
              (fv) =>
                `      <doma:fixValue>\n        <doma:low>${fv.low}</doma:low>\n        <doma:text>${fv.text}</doma:text>\n      </doma:fixValue>`,
            )
            .join('\n')}\n    </doma:fixValues>`
        : '<doma:fixValues/>';
    xml = patchXmlBlock(xml, 'doma:fixValues', block);
  }

  return xml;
}
