import { patchIf, patchXmlAttribute, patchXmlElement } from './xmlPatch';

/**
 * ADT truncates a description at 60 characters, so this does too rather than
 * letting the server decide and answer about it.
 */
function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/**
 * What a caller may change about a table type. Everything else is left
 * alone.
 *
 * Field names match `IUpdateTableTypeParams` (`@mcp-abap-adt/interfaces`),
 * the snake_case shape `v18.0.2`'s own patcher took.
 */
export interface TableTypeChanges {
  description?: string;
  row_type_kind?: string;
  row_type_name?: string;
  access_type?: string;
  primary_key_definition?: string;
  primary_key_kind?: string;
}

/**
 * Patch a table type's own document with what the caller asked to change.
 *
 * Ported from what adt-clients did inside `updateTableType` until 19 removed
 * it (`v18.0.2`, `src/core/tabletype/update.ts`). Only the fields named are
 * touched; everything else in the document travels through unread.
 *
 * **Unverified against the corpus.** No `read-metadata-tabletype` fixture
 * exists yet — see `tableTypePatch.test.ts` for what that leaves untested,
 * and `task-22-brief.md` for the capture command that would fill the gap.
 *
 * **No handler in this repository calls this.** `table/high/handleUpdateTable.ts`
 * (and its low-tier sibling) address `TABL/DT` — a physical table with DDL
 * source, through `AdtTable.update()` — not `TTYP/DA` table types, which
 * `adt-clients` exposes through the separate `AdtDdicTableType` class this
 * repository has never wired to a tool. This patcher exists so that wiring,
 * whenever it happens, does not have to port `v18.0.2`'s field list again.
 */
export function patchTableTypeXml(
  currentXml: string,
  changes: TableTypeChanges,
): string {
  let xml = currentXml;

  if (changes.description) {
    xml = patchXmlAttribute(
      xml,
      'adtcore:description',
      limitDescription(changes.description),
    );
  }

  xml = patchIf(xml, changes.row_type_kind, (x, v) =>
    patchXmlElement(x, 'ttyp:typeKind', String(v)),
  );
  xml = patchIf(xml, changes.row_type_name, (x, v) =>
    patchXmlElement(x, 'ttyp:typeName', String(v).toUpperCase()),
  );
  xml = patchIf(xml, changes.access_type, (x, v) =>
    patchXmlElement(x, 'ttyp:accessType', String(v)),
  );
  xml = patchIf(xml, changes.primary_key_definition, (x, v) =>
    patchXmlElement(x, 'ttyp:definition', String(v)),
  );
  xml = patchIf(xml, changes.primary_key_kind, (x, v) =>
    patchXmlElement(x, 'ttyp:kind', String(v)),
  );

  return xml;
}
