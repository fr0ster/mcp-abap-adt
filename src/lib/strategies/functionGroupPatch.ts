import { patchXmlAttribute } from './xmlPatch';

/**
 * ADT truncates a function group's description at 40 characters — shorter
 * than the 60-character limit domain/package/dataElement share.
 * `adtcore:descriptionTextLimit="40"` is on the corpus fixture itself
 * (`read-metadata-function-group--01-groups-zmcpshrfgrp.body.xml`), so this
 * truncates the same way rather than letting the server decide and answer
 * about it.
 */
function limitDescription(description: string): string {
  return description.length > 40 ? description.substring(0, 40) : description;
}

/**
 * What a caller may change about a function group. Everything else is left
 * alone.
 *
 * A function group is a container for function modules and has no source of
 * its own — the description is the only field `v18.0.2`'s own patcher ever
 * touched (`core/functionGroup/update.ts`: "A function group is a container:
 * the only thing `update` changes is its description.").
 */
export interface FunctionGroupChanges {
  description?: string;
}

/**
 * Patch a function group's own document with what the caller asked to
 * change.
 *
 * Ported from what adt-clients did inside `updateFunctionGroup` until 19
 * removed it. Only `adtcore:description` is touched; everything else in the
 * document — the syntax configuration, the links, whatever SAP keeps there —
 * travels through unread.
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
