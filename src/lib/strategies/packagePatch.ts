import {
  patchIf,
  patchXmlAttribute,
  patchXmlElementAttribute,
} from './xmlPatch';

/**
 * ADT truncates a description at 60 characters, so this does too rather than
 * letting the server decide and answer about it.
 */
function limitDescription(description: string): string {
  return description.length > 60 ? description.substring(0, 60) : description;
}

/**
 * What a caller may change about a package. Everything else is left alone.
 *
 * `UpdatePackageLow`'s own tool surface exposes only `updated_description` —
 * this interface carries the rest of what `v18.0.2`'s `patchPackageXml`
 * supported too, for the one caller inside this repository that wants more
 * than the description (a future high-tier update, or a caller who imports
 * this directly) without inventing a second patcher later.
 */
export interface PackageChanges {
  description?: string;
  responsible?: string;
  master_system?: string;
  package_type?: string;
  record_changes?: boolean;
  super_package?: string;
  software_component?: string;
  transport_layer?: string;
}

/**
 * Patch a package's own document with what the caller asked to change.
 *
 * Ported from what adt-clients did inside `updatePackage` until 19 removed it
 * (`v18.0.2`, `src/core/package/update.ts`). Only the fields named are
 * touched; everything else in the document — `abapLanguageVersion`, the
 * links, whatever SAP keeps there — travels through unread. Verified against
 * `read-metadata-package--01-packages-zmcpshrpkg.body.xml`: `pak:attributes`
 * carries `pak:packageType` and `pak:recordChanges` as attributes,
 * `pak:superPackage` carries `adtcore:name`, and `pak:softwareComponent` /
 * `pak:transportLayer` carry `pak:name` — nested inside `pak:transport` in
 * the real document, which `patchXmlElementAttribute`'s plain-text search
 * does not care about.
 */
export function patchPackageXml(
  currentXml: string,
  changes: PackageChanges,
): string {
  let xml = currentXml;

  if (changes.description) {
    xml = patchXmlAttribute(
      xml,
      'adtcore:description',
      limitDescription(changes.description),
    );
  }

  xml = patchIf(xml, changes.responsible || undefined, (x, v) =>
    patchXmlAttribute(x, 'adtcore:responsible', v),
  );
  xml = patchIf(xml, changes.master_system || undefined, (x, v) =>
    patchXmlAttribute(x, 'adtcore:masterSystem', v),
  );

  xml = patchIf(xml, changes.package_type || undefined, (x, v) =>
    patchXmlElementAttribute(x, 'pak:attributes', 'pak:packageType', v),
  );
  if (changes.record_changes !== undefined) {
    xml = patchXmlElementAttribute(
      xml,
      'pak:attributes',
      'pak:recordChanges',
      changes.record_changes ? 'true' : 'false',
    );
  }

  xml = patchIf(xml, changes.super_package || undefined, (x, v) =>
    patchXmlElementAttribute(x, 'pak:superPackage', 'adtcore:name', v),
  );
  xml = patchIf(xml, changes.software_component || undefined, (x, v) =>
    patchXmlElementAttribute(x, 'pak:softwareComponent', 'pak:name', v),
  );
  xml = patchIf(xml, changes.transport_layer || undefined, (x, v) =>
    patchXmlElementAttribute(x, 'pak:transportLayer', 'pak:name', v),
  );

  return xml;
}
