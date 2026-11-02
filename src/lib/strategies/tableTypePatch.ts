import { parseStructure } from './reading';
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

/**
 * The definition a table type's document states: the elements
 * `patchTableTypeXml` writes, each as SAP wrote it (its text, verbatim — a
 * length is `000010`, as SAP answers it). An element the document does not
 * hold is not named.
 */
export interface StoredTableTypeDefinition {
  row_type_kind?: string;
  row_type_name?: string;
  data_type?: string;
  length?: string;
  decimals?: string;
  access_type?: string;
  key_definition?: string;
  key_kind?: string;
}

/** `node`'s child `name`, when `node` is a parsed element that holds one. */
function childOf(node: unknown, name: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
  return Reflect.get(node, name);
}

/** A parsed element's text: a bare string, or `#text` beside its attributes. */
function textOfElement(node: unknown): string | undefined {
  if (typeof node === 'string') return node;
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
  const text: unknown = Reflect.get(node, '#text');
  if (typeof text === 'string') return text;
  // An element with attributes and no text (`<ttyp:x a="1"/>`): empty.
  return Object.keys(node).every((key) => key === '@') ? '' : undefined;
}

/**
 * Read the definition a table type's document states (`ttyp:tableType`, as a
 * read of the object answers it). The document is SAP's, from outside the
 * type system: `undefined` when it is not a table type document; an element
 * that is absent, or not a single element with text, is left out.
 */
export function readTableTypeDefinition(
  document: string,
): StoredTableTypeDefinition | undefined {
  const root = childOf(parseStructure(document), 'ttyp:tableType');
  if (typeof root !== 'object' || root === null || Array.isArray(root)) return;
  const rowType = childOf(root, 'ttyp:rowType');
  const builtIn = childOf(rowType, 'ttyp:builtInType');
  const primaryKey = childOf(root, 'ttyp:primaryKey');
  const read: ReadonlyArray<
    readonly [keyof StoredTableTypeDefinition, unknown]
  > = [
    ['row_type_kind', childOf(rowType, 'ttyp:typeKind')],
    ['row_type_name', childOf(rowType, 'ttyp:typeName')],
    ['data_type', childOf(builtIn, 'ttyp:dataType')],
    ['length', childOf(builtIn, 'ttyp:length')],
    ['decimals', childOf(builtIn, 'ttyp:decimals')],
    ['access_type', childOf(root, 'ttyp:accessType')],
    ['key_definition', childOf(primaryKey, 'ttyp:definition')],
    ['key_kind', childOf(primaryKey, 'ttyp:kind')],
  ];
  const stored: StoredTableTypeDefinition = {};
  for (const [field, node] of read) {
    const text = textOfElement(node);
    if (text !== undefined) stored[field] = text;
  }
  return stored;
}
