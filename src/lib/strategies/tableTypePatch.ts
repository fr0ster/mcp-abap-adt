import { patchIf, patchXmlAttribute, patchXmlElement } from './xmlPatch';

/**
 * ADT truncates a description at 60 characters, so this does too rather than
 * letting the server decide and answer about it.
 */
function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/**
 * What a caller may change about a table type. Everything else is left alone,
 * and so is every property not given. The values are passed as given: which
 * ones SAP takes is SAP's answer.
 */
export interface TableTypeChanges {
  description?: string;
  /** `ttyp:rowType/ttyp:typeKind`. */
  row_type_kind?: string;
  /** `ttyp:rowType/ttyp:typeName`, a dictionary type. */
  row_type_name?: string;
  /** `ttyp:builtInType/ttyp:dataType`. */
  data_type?: string;
  /** `ttyp:builtInType/ttyp:length`. */
  length?: number | string;
  /** `ttyp:builtInType/ttyp:decimals`. */
  decimals?: number | string;
  /** `ttyp:accessType`. */
  access_type?: string;
  /** `ttyp:primaryKey/ttyp:definition`. */
  key_definition?: string;
  /** `ttyp:primaryKey/ttyp:kind`. */
  key_kind?: string;
}

/**
 * Patch a table type's own document with what the caller asked to change, as
 * `patchDomainXml` does for a domain: the document carries fields nobody here
 * knows about, so the text is patched and not rebuilt. Each element of the
 * document appears once, so an element's tag alone names it.
 */
export function patchTableTypeXml(
  currentXml: string,
  changes: TableTypeChanges,
): string {
  const element = (tag: string) => (xml: string, value: string | number) =>
    patchXmlElement(xml, tag, String(value));

  let xml = currentXml;
  xml = patchIf(xml, changes.description, (x, v) =>
    patchXmlAttribute(x, 'adtcore:description', limitDescription(v)),
  );
  xml = patchIf(xml, changes.row_type_kind, element('ttyp:typeKind'));
  xml = patchIf(xml, changes.row_type_name, element('ttyp:typeName'));
  xml = patchIf(xml, changes.data_type, element('ttyp:dataType'));
  xml = patchIf(xml, changes.length, element('ttyp:length'));
  xml = patchIf(xml, changes.decimals, element('ttyp:decimals'));
  xml = patchIf(xml, changes.access_type, element('ttyp:accessType'));
  xml = patchIf(xml, changes.key_definition, element('ttyp:definition'));
  xml = patchIf(xml, changes.key_kind, element('ttyp:kind'));
  return xml;
}
