/**
 * What a handler asks to change in a metadata document, mapped to the
 * changes adt-clients' patch takes (`IDomainChanges`, …).
 *
 * The XML is the library's (`documentPatch.ts`); the values stay the
 * server's: the handlers' snake_case arguments, a description written only
 * when one is given, a data element's `type_name` fallback and upper-casing,
 * and its label lengths. A field left `undefined` is not changed; the
 * description is passed as given, with no truncation — SAP's answer to one
 * over the limit reaches the model as it is.
 */

import type {
  IDataElementChanges,
  IDomainChanges,
  ITableTypeChanges,
} from '@mcp-abap-adt/adt-clients';
import type { IDataElementConfig } from '@mcp-abap-adt/interfaces-adt';

/** A non-empty description, or none: an empty one is not written. */
function givenDescription(description: string | undefined): string | undefined {
  return description ? description : undefined;
}

/** What a caller may change about a domain. */
export interface DomainChanges {
  description?: string;
  datatype?: string;
  length?: number;
  decimals?: number;
  conversion_exit?: string;
  sign_exists?: boolean;
  lowercase?: boolean;
  value_table?: string;
  fixed_values?: ReadonlyArray<{ low: string; text: string }>;
}

/** A domain's changes as the library's patch takes them. */
export function domainChanges(changes: DomainChanges): IDomainChanges {
  return {
    description: givenDescription(changes.description),
    dataType: changes.datatype,
    length: changes.length,
    decimals: changes.decimals,
    conversionExit: changes.conversion_exit,
    signExists: changes.sign_exists,
    lowercase: changes.lowercase,
    valueTable: changes.value_table,
    fixedValues: changes.fixed_values,
  };
}

/** A data element's type kind, as the patch writes it. */
export type DataElementTypeKind = NonNullable<IDataElementConfig['typeKind']>;

/** What a caller may change about a data element. */
export interface DataElementChanges {
  description?: string;
  type_kind?: DataElementTypeKind;
  type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  short_label?: string;
  medium_label?: string;
  long_label?: string;
  heading_label?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
}

/**
 * The type name written: for a domain-based type the `type_name` given or,
 * when only `data_type` names it, that — upper-cased; for any other kind the
 * `type_name` given, upper-cased. None when neither names one.
 */
function typeNameOf(changes: DataElementChanges): string | undefined {
  if (!changes.type_kind && !changes.type_name && !changes.data_type) return;
  const typeName =
    changes.type_kind === 'domain'
      ? (changes.type_name || changes.data_type || '').toUpperCase()
      : (changes.type_name || '').toUpperCase();
  return typeName ? typeName : undefined;
}

/** A label's length: the label's own, or `fallback` for an empty label. */
function labelLength(
  label: string | undefined,
  fallback: number,
): number | undefined {
  return label === undefined ? undefined : label.length || fallback;
}

/** A data element's changes as the library's patch takes them. */
export function dataElementChanges(
  changes: DataElementChanges,
): IDataElementChanges {
  return {
    description: givenDescription(changes.description),
    typeKind: changes.type_kind,
    typeName: typeNameOf(changes),
    dataType: changes.data_type,
    length: changes.length,
    decimals: changes.decimals,
    shortLabel: changes.short_label,
    mediumLabel: changes.medium_label,
    longLabel: changes.long_label,
    headingLabel: changes.heading_label,
    shortLength: labelLength(changes.short_label, 10),
    mediumLength: labelLength(changes.medium_label, 20),
    longLength: labelLength(changes.long_label, 40),
    headingLength: labelLength(changes.heading_label, 55),
    searchHelp: changes.search_help,
    searchHelpParameter: changes.search_help_parameter,
    setGetParameter: changes.set_get_parameter,
  };
}

/** What a caller may change about a table type. */
export interface TableTypeChanges {
  description?: string;
  row_type_kind?: string;
  row_type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  access_type?: string;
  key_definition?: string;
  key_kind?: string;
}

/** A table type's changes as the library's patch takes them. */
export function tableTypeChanges(changes: TableTypeChanges): ITableTypeChanges {
  return {
    description: changes.description,
    rowTypeKind: changes.row_type_kind,
    rowTypeName: changes.row_type_name,
    dataType: changes.data_type,
    length: changes.length,
    decimals: changes.decimals,
    accessType: changes.access_type,
    keyDefinition: changes.key_definition,
    keyKind: changes.key_kind,
  };
}
