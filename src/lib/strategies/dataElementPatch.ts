import { patchIf, patchXmlAttribute, patchXmlElement } from './xmlPatch';

/**
 * ADT truncates a description at 60 characters, so this does too rather than
 * letting the server decide and answer about it.
 */
function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/**
 * What a caller may change about a data element. Everything else is left
 * alone.
 *
 * Field names match what `properties` on `UpdateDataElementLow` always
 * accepted (snake_case, the handler's own convention) — the handler
 * normalises `properties`' camelCase aliases into this shape before calling
 * {@link patchDataElementXml}, the same way it always has.
 */
export interface DataElementChanges {
  description?: string;
  type_kind?: string;
  type_name?: string;
  data_type?: string;
  length?: number | string;
  decimals?: number | string;
  short_label?: string;
  medium_label?: string;
  long_label?: string;
  heading_label?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
}

/**
 * Patch a data element's own document with what the caller asked to change.
 *
 * Ported from what adt-clients did inside `updateDataElement` until 19
 * removed it (`v18.0.2`, `src/core/dataElement/update.ts`). Only the fields
 * named are touched; everything else in the document travels through unread,
 * which is the whole reason this patches text rather than building a document
 * from the caller's fields.
 *
 * **The description half is verified against a real captured document; the
 * element-level fields below it are not, and I cannot prove them wrong.**
 * `create-dataelement--01-ddic-dataelements.body.xml` is the one genuine
 * data-element document in the corpus — a create response, not a metadata
 * read, but `verbatim` per `resultSets.ts` either way. Its root element is
 * `<blue:wbobj … xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel">` —
 * SAP bound this document's `dtel` namespace to the alias `blue`, not to
 * `dtel`. `adtcore:description` does not care (it is unprefixed, matched by
 * `patchXmlAttribute` regardless of which alias the root uses), so
 * `dataElementPatch.test.ts` can and does assert the description half
 * against these real bytes. But every element-level patch below
 * (`dtel:typeKind`, `dtel:typeName`, `dtel:dataType`, the labels, the search
 * help fields) is hardcoded to the `dtel:` alias — and this particular
 * document has no populated children of any kind to check them against: a
 * fresh create answers only the wrapper, `packageRef` and a couple of
 * `atom:link`s. If a real, populated data element document also binds
 * `dtel`'s namespace to `blue` rather than `dtel`, every one of those
 * patches would throw `XmlPatchError` rather than silently miswrite — which
 * is the correct failure mode either way, just possibly the wrong one to
 * fail with this often. I cannot prove that wrong from what is captured
 * today. A `read-metadata-data-element` capture with populated fields —
 * the one the brief for this task names as missing — is what would settle
 * it.
 */
export function patchDataElementXml(
  currentXml: string,
  changes: DataElementChanges,
): string {
  let xml = currentXml;

  if (changes.description) {
    xml = patchXmlAttribute(
      xml,
      'adtcore:description',
      limitDescription(changes.description),
    );
  }

  xml = patchIf(xml, changes.type_kind, (x, v) =>
    patchXmlElement(x, 'dtel:typeKind', String(v)),
  );

  // typeName: for a domain-based type the domain name is what the caller put
  // in `type_name` or, when only the older `data_type` field was given, there
  // — matching the pre-19 handler's own fallback. For every other type kind
  // only `type_name` names it.
  if (changes.type_kind || changes.type_name || changes.data_type) {
    const typeName =
      changes.type_kind === 'domain'
        ? (changes.type_name || changes.data_type || '').toUpperCase()
        : changes.type_name
          ? changes.type_name.toUpperCase()
          : '';
    if (typeName) {
      xml = patchXmlElement(xml, 'dtel:typeName', typeName);
    }
  }

  xml = patchIf(xml, changes.data_type, (x, v) =>
    patchXmlElement(x, 'dtel:dataType', String(v)),
  );
  xml = patchIf(xml, changes.length, (x, v) =>
    patchXmlElement(x, 'dtel:dataTypeLength', String(v).padStart(6, '0')),
  );
  xml = patchIf(xml, changes.decimals, (x, v) =>
    patchXmlElement(x, 'dtel:dataTypeDecimals', String(v).padStart(6, '0')),
  );

  if (changes.short_label !== undefined) {
    xml = patchXmlElement(xml, 'dtel:shortFieldLabel', changes.short_label);
    xml = patchXmlElement(
      xml,
      'dtel:shortFieldLength',
      String(changes.short_label.length || 10),
    );
  }
  if (changes.medium_label !== undefined) {
    xml = patchXmlElement(xml, 'dtel:mediumFieldLabel', changes.medium_label);
    xml = patchXmlElement(
      xml,
      'dtel:mediumFieldLength',
      String(changes.medium_label.length || 20),
    );
  }
  if (changes.long_label !== undefined) {
    xml = patchXmlElement(xml, 'dtel:longFieldLabel', changes.long_label);
    xml = patchXmlElement(
      xml,
      'dtel:longFieldLength',
      String(changes.long_label.length || 40),
    );
  }
  if (changes.heading_label !== undefined) {
    xml = patchXmlElement(xml, 'dtel:headingFieldLabel', changes.heading_label);
    xml = patchXmlElement(
      xml,
      'dtel:headingFieldLength',
      String(changes.heading_label.length || 55),
    );
  }

  if (changes.search_help !== undefined) {
    xml = patchXmlElement(xml, 'dtel:searchHelp', changes.search_help);
  }
  if (changes.search_help_parameter !== undefined) {
    xml = patchXmlElement(
      xml,
      'dtel:searchHelpParameter',
      changes.search_help_parameter,
    );
  }
  if (changes.set_get_parameter !== undefined) {
    xml = patchXmlElement(
      xml,
      'dtel:setGetParameter',
      changes.set_get_parameter,
    );
  }

  return xml;
}
