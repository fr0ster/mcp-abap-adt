/**
 * SAP's refusals as an on-premise system sends them: its exception document,
 * `content-type: application/xml` (the document's own type), the message in
 * `message` and `localizedMessage`.
 */

/** SAP's exception document around `message`. */
export function sapException(type: string, message: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
    `<namespace id="com.sap.adt"/><type id="${type}"/>` +
    `<message lang="EN">${message}</message>` +
    `<localizedMessage lang="EN">${message}</localizedMessage>` +
    '<properties/></exc:exception>'
  );
}

/** The headers of SAP's exception document. */
export const SAP_EXCEPTION_HEADERS: Record<string, string> = {
  'content-type': 'application/xml',
};

/**
 * The body of SAP's `415`: "Unsupported Media Type. Supported Media Types:
 * <types>", or the bare "Unsupported Media Type" when `types` is absent.
 */
export function unsupportedMediaTypeBody(types?: string): string {
  return sapException(
    'ExceptionUnsupportedMediaType',
    types === undefined
      ? 'Unsupported Media Type'
      : `Unsupported Media Type. Supported Media Types: ${types}`,
  );
}
