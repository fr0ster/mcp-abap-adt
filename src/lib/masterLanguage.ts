/**
 * What a create does with `master_language`, as every create tool lists it
 * (#348).
 *
 * SAP takes a new object's original language from the request's logon
 * language and ignores the create body's (measured on ABAP cloud): a create
 * given a language sends it as `sap-language` beside the body's language
 * attributes (adt-clients 43). Absent, the session's language
 * (`SAP_LANGUAGE`, or `x-sap-language` over HTTP) is used the same way; with
 * neither, the create states no language and SAP's logon language applies.
 */
export const MASTER_LANGUAGE_DESCRIPTION =
  "Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.";
