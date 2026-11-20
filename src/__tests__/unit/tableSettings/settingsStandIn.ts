/**
 * A table's technical settings document as SAP answers it, sanitised from the
 * reads measured on premise and on the cloud (2026-11-19): the same elements
 * on both, and on the cloud `ts:isWritableByAMDP` after the rest
 * (`table-settings.md` §3, §8).
 */
export const SETTINGS_MEDIA_TYPE =
  'application/vnd.sap.adt.table.settings.v2+xml';

/** The settings document of `name`, with `isWritableByAMDP` when given. */
export function settingsDocument(
  name: string,
  version: string,
  isWritableByAMDP?: boolean,
): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<ts:tableSettings adtcore:name="${name}" adtcore:type="TABL/DTT" adtcore:version="${version}" ` +
    'adtcore:description="Settings of a table" adtcore:descriptionTextLimit="-1" adtcore:language="EN" ' +
    'xmlns:ts="http://www.sap.com/dictionary/table/settings" xmlns:adtcore="http://www.sap.com/adt/core">' +
    `<adtcore:containerRef adtcore:uri="/sap/bc/adt/ddic/tables/${name.toLowerCase()}" adtcore:type="TABL/DT" adtcore:name="${name}"/>` +
    '<ts:dataClassCategory>APPL1</ts:dataClassCategory>' +
    '<ts:sizeCategory>1</ts:sizeCategory>' +
    '<ts:buffering><ts:allowed>N</ts:allowed><ts:type/><ts:areaKeyFields>0</ts:areaKeyFields></ts:buffering>' +
    '<ts:storageType>C</ts:storageType><ts:sharingType/><ts:loadUnit/>' +
    '<ts:translation ts:value="" ts:isVisible="false" ts:isEditable="false" ts:granularity="2"/>' +
    '<ts:loggingEnabled>false</ts:loggingEnabled>' +
    '<ts:supportsLoggingAssessment>false</ts:supportsLoggingAssessment>' +
    (isWritableByAMDP === undefined
      ? ''
      : `<ts:isWritableByAMDP>${isWritableByAMDP}</ts:isWritableByAMDP>`) +
    '</ts:tableSettings>'
  );
}

/** The ETag SAP answers a settings read with (its shape, measured). */
export const SETTINGS_ETAG =
  '20261119095456000Aapplication/vnd.sap.adt.table.settings.v2+xmlETAGHASH=';
