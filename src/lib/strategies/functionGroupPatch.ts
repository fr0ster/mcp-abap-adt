import { patchXmlAttribute } from './xmlPatch';

/**
 * ADT truncates a function group's description at 40 characters — shorter
 * than the 60-character limit domain/package/dataElement share.
 *
 * The 40 comes from two sources actually in this tree, not from
 * `v18.0.2`: the pre-migration version of `handleUpdateFunctionGroup.ts`
 * already hardcoded 40 (`// SAP requirement: adtcore:description is limited
 * to 40 characters.`), and the corpus fixture confirms it independently —
 * `adtcore:descriptionTextLimit="40"` is an attribute on the captured
 * document itself
 * (`read-metadata-function-group--01-groups-zmcpshrfgrp.body.xml`).
 *
 * **This is a genuine divergence from `v18.0.2`, not a rounding of the same
 * number.** `mcp-abap-adt-clients` tag `v18.0.2`'s own
 * `updateFunctionGroupMetadata` (`src/core/functionGroup/update.ts`) called
 * the *shared* `limitDescription` from `utils/internalUtils.ts`, which
 * truncates at 60 — the same helper domain/package/dataElement's create
 * paths use, with nothing function-group-specific about it. So the old
 * client library would have sent up to 60 characters for a field the corpus
 * shows this system caps at 40; whether that ever produced a visible SAP
 * error, or ADT silently truncated the extra 20 characters on its own side,
 * is not something either the fixture or the old source settles.
 */
function limitDescription(description: string): string {
  return description.length > 40 ? description.substring(0, 40) : description;
}

/**
 * What a caller may change about a function group. Everything else is left
 * alone.
 *
 * A function group is a container for function modules and has no source of
 * its own — the description is the only field a function group update has
 * ever touched, in this repository's pre-migration handler and in
 * `v18.0.2`'s own `updateFunctionGroup` alike.
 */
export interface FunctionGroupChanges {
  description?: string;
}

/**
 * Patch a function group's own document with what the caller asked to
 * change.
 *
 * The one field this touches (`adtcore:description`) matches what
 * `v18.0.2`'s `updateFunctionGroup` (`src/core/functionGroup/update.ts`,
 * `mcp-abap-adt-clients` tag `v18.0.2`) patched before 19 removed the
 * merge — see `limitDescription` above for the one constant that does not
 * match it. Everything else in the document — the syntax configuration,
 * the links, whatever SAP keeps there — travels through unread.
 */
export function patchFunctionGroupXml(
  currentXml: string,
  changes: FunctionGroupChanges,
): string {
  let xml = currentXml;

  if (changes.description) {
    xml = patchXmlAttribute(
      xml,
      'adtcore:description',
      limitDescription(changes.description),
    );
  }

  return xml;
}
