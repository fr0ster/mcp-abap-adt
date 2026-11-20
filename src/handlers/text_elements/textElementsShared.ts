/**
 * What the text elements tools share: the object kinds and their parts, as
 * SAP serves them.
 *
 * - A program and a function group carry text symbols, selection texts and
 *   list and column headings; a class carries text symbols only (Code,
 *   `CL_SEDX_ADT_RES_TEXTELEMENT->get_properties`: `when 'CLAS'.` lists
 *   `co_source-symbols` alone, `when 'PROG'.` and `when 'FUGR' or 'FUGS' or
 *   'FUGX'.` all three).
 * - The texts are the object's original language: SAP reads and writes the
 *   text pool in TADIR's master language whatever the logon language (Code,
 *   `lcl_textpool->read`: `RS_TEXTPOOL_READ … language = master_language`;
 *   `save`: `RPY_TEXTELEMENTS_INSERT_AIE … language = tadir-masterlang`;
 *   measured on premise and on the cloud, 2026-11-19).
 */
import type {
  TextElementsObjectKind,
  TextElementsPart,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';

/** The object kinds as the tools name them. */
export const OBJECT_KINDS = ['program', 'function_group', 'class'] as const;

/** An object kind as the tools name it. */
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** The parts as the tools name them. */
export const PARTS = ['symbols', 'selections', 'headings'] as const;

/** The library's kind for a tool's. */
export function libraryKind(kind: ObjectKind): TextElementsObjectKind {
  return kind === 'function_group' ? 'functionGroup' : kind;
}

/** The parts `kind` carries. */
export function partsOf(kind: ObjectKind): readonly TextElementsPart[] {
  return kind === 'class' ? ['symbols'] : PARTS;
}

/** The `object_name` argument. */
export const OBJECT_NAME_FIELD = z
  .string()
  .min(1, 'object_name is required')
  .describe('Name of the program, function group or class.');
