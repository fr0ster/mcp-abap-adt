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

export const SYMBOLS = z
  .array(
    z.object({
      key: z.string().describe('Symbol key, up to 3 characters.'),
      text: z.string().describe('Symbol text, up to its maximum length.'),
      max_length: z
        .number()
        .int()
        .positive()
        .describe('Maximum length of the text.'),
    }),
  )
  .optional()
  .describe('The text symbols: the whole list; symbols left out are deleted.');

export const SELECTIONS = z
  .array(
    z.object({
      name: z
        .string()
        .describe(
          'Name of the parameter or select-option, up to 8 characters.',
        ),
      text: z.string().describe('Selection text, up to 30 characters.'),
      ddic_reference: z
        .boolean()
        .optional()
        .describe(
          "true takes the dictionary field's label as the text, in place of text.",
        ),
    }),
  )
  .optional()
  .describe(
    'The selection texts (programs and function groups): the whole list; texts left out are deleted.',
  );

export const HEADINGS = z
  .object({
    list_header: z.string().optional(),
    column_header_1: z.string().optional(),
    column_header_2: z.string().optional(),
    column_header_3: z.string().optional(),
    column_header_4: z.string().optional(),
  })
  .optional()
  .describe(
    'The list header and four column headers (programs and function groups); a heading given empty or left out is deleted.',
  );
