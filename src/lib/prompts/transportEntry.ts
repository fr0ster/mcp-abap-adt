/**
 * A transport entry as the prompts read it and send it: the object-directory
 * type of each type, and the argument each field of a read entry is sent as.
 */
import type * as z from 'zod';
import type { MOVED_ENTRY } from '../../handlers/transport/high/handleMoveTransportObjects.js';
import type { TableMainOf } from '../adtProjections.js';
import type { ReadEntryField } from './types.js';
import type { WHERE_USED_AS, WhereUsedType } from './whereUsedPrompt.js';

/** The types a transport entry names: every where-used type with an `R3TR` object of its own. */
export type TransportObjectType = Exclude<
  WhereUsedType,
  'FUNCTION_MODULE' | 'TEXT_ELEMENTS'
>;

/** The part of code `C` before its slash. */
export type MainPart<C extends string> = C extends `${infer M}/${string}`
  ? M
  : never;

/**
 * The object-directory type of each type: the main type of its where-used
 * code, which the tables state and the code's text begins with — a type
 * where the two differ does not compile.
 */
export const OBJECT_DIRECTORY_TYPE: {
  readonly [T in TransportObjectType]: TableMainOf<(typeof WHERE_USED_AS)[T]> &
    MainPart<(typeof WHERE_USED_AS)[T]>;
} = {
  CLASS: 'CLAS',
  INTERFACE: 'INTF',
  PROGRAM: 'PROG',
  INCLUDE: 'PROG',
  FUNCTION_GROUP: 'FUGR',
  PACKAGE: 'DEVC',
  DDL: 'DDLS',
  TABLE: 'TABL',
  STRUCTURE: 'TABL',
  TABLE_TYPE: 'TTYP',
  DOMAIN: 'DOMA',
  DATA_ELEMENT: 'DTEL',
  BEHAVIOR_DEFINITION: 'BDEF',
  METADATA_EXTENSION: 'DDLX',
  SERVICE_DEFINITION: 'SRVD',
  SERVICE_BINDING: 'SRVB',
};

/** The types in the order they are offered. */
export const TRANSPORT_OBJECT_TYPES: readonly TransportObjectType[] = [
  'CLASS',
  'INTERFACE',
  'PROGRAM',
  'INCLUDE',
  'FUNCTION_GROUP',
  'PACKAGE',
  'DDL',
  'TABLE',
  'STRUCTURE',
  'TABLE_TYPE',
  'DOMAIN',
  'DATA_ELEMENT',
  'BEHAVIOR_DEFINITION',
  'METADATA_EXTENSION',
  'SERVICE_DEFINITION',
  'SERVICE_BINDING',
];

/** The argument each field of a read entry is sent as: a field of the moved entry. */
export const ENTRY_ARGUMENT: {
  readonly [K in ReadEntryField]: keyof z.input<typeof MOVED_ENTRY>;
} = {
  name: 'object_name',
  type: 'object_type',
  position: 'position',
  pgmid: 'pgmid',
};

/** The fields of a read entry an entry sent carries, `pgmid` among them. */
export const ENTRY_FIELDS: readonly ReadEntryField[] = [
  'name',
  'type',
  'position',
  'pgmid',
];

/** The pairs (sent argument, read field) of an entry sent. */
export const SENT_ENTRY: readonly (readonly [string, ReadEntryField])[] =
  ENTRY_FIELDS.map((field) => [ENTRY_ARGUMENT[field], field]);
