/**
 * GetTextElements - a program's, function group's or class's text elements.
 *
 * SAP keeps them at `/sap/bc/adt/textelements/{programs|functiongroups|classes}/{name}`,
 * one sub-resource per part (`…/source/symbols`, `…/selections`,
 * `…/headings`), each answered in its own media type (adt-clients'
 * `TEXT_ELEMENTS_MEDIA_TYPES`). One GET per part asked, through adt-clients'
 * `getTextElements().read`, read by adt-strategies' `textSymbols`,
 * `selectionTexts` and `textHeadings`.
 *
 * - Versions: no version or `inactive` or `workingArea` read the working
 *   area, `active` the last activated version (measured on premise,
 *   `texts-translation.md` §10, §12.4; the cloud's `active` read after an
 *   activation measured, §13.5).
 * - A function group's text elements are addressed by the group's name
 *   (`/textelements/functiongroups/{group}`; SAP maps it to the group's main
 *   program itself, measured on premise and on the cloud, §10, §13).
 */

import { textElementsDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ISelectionTextsDocument,
  type ITextHeadingsDocument,
  type ITextSymbolsDocument,
  selectionTexts,
  textHeadings,
  textSymbols,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  TextElementsPart,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { textElementsClientOf } from '../../../lib/clients';
import { membersOf, purpose, toolDescription } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import { succeeded } from '../../../lib/strategies/stepResponse';
import {
  libraryKind,
  OBJECT_KINDS,
  OBJECT_NAME_FIELD,
  type ObjectKind,
  PARTS,
  partsOf,
} from '../textElementsShared';

export const TOOL_DEFINITION = {
  name: 'GetTextElements',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the text elements of an ABAP program, function group or class in its original language at the version asked: text symbols, selection texts and headings.',
    ),
    returns: [
      ...membersOf<TextSymbolAnswer>('for each text symbol:', {
        key: 'its key',
        text: 'its text',
        max_length: 'its maximum length',
      }),
      ...membersOf<SelectionTextAnswer>('for each selection text:', {
        name: 'its name',
        text: 'its text',
        ddic_reference: "whether it is the dictionary's label",
      }),
      ...membersOf<HeadingsAnswer>('its headings:', {
        list_header: 'the list heading',
        column_header_1: 'the first of the four headings below it',
        column_header_2: 'the second',
        column_header_3: 'the third',
        column_header_4: 'the fourth',
      }),
    ],
  }),
  inputSchema: z
    .object({
      object_kind: z
        .enum(OBJECT_KINDS)
        .describe('Kind of object: program, function_group or class.'),
      object_name: OBJECT_NAME_FIELD,
      parts: z
        .array(z.enum(PARTS))
        .min(1)
        .optional()
        .describe(
          'Parts to read: symbols, selections, headings. Default: every part of the object; a class has symbols only.',
        ),
      version: READ_VERSION_FIELD,
    })
    .superRefine((args, ctx) => {
      const served = partsOf(args.object_kind);
      for (const part of args.parts ?? []) {
        if (!served.includes(part)) {
          ctx.addIssue({
            code: 'custom',
            message: `A ${args.object_kind} has no ${part}: it has ${served.join(', ')}`,
            path: ['parts'],
          });
        }
      }
    }),
} as const;

type GetTextElementsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** One text symbol, as the tool answers it. */
type TextSymbolAnswer = NonNullable<TextElementsAnswer['symbols']>[number];

/** One selection text, as the tool answers it. */
type SelectionTextAnswer = NonNullable<
  TextElementsAnswer['selections']
>[number];

/** The headings, as the tool answers them. */
type HeadingsAnswer = NonNullable<TextElementsAnswer['headings']>;

/** The text elements read, part by part, as the tool answers them. */
export interface TextElementsAnswer {
  symbols?: Array<{ key: string; text: string; max_length: number }>;
  selections?: Array<{ name: string; text: string; ddic_reference: boolean }>;
  headings?: {
    list_header: string;
    column_header_1: string;
    column_header_2: string;
    column_header_3: string;
    column_header_4: string;
  };
}

/** A read part, as the tool answers it. */
export function partAnswer(
  read: ITextSymbolsDocument | ISelectionTextsDocument | ITextHeadingsDocument,
): TextElementsAnswer {
  switch (read.part) {
    case 'symbols':
      return {
        symbols: read.symbols.map((symbol) => ({
          key: symbol.key,
          text: symbol.text,
          max_length: symbol.maxLength,
        })),
      };
    case 'selections':
      return {
        // SAP pads a selection text's name to eight; the answer gives it as
        // the name it is, which a write takes as it is (measured on premise:
        // unpadded and padded names alike, `texts-translation.md` §10).
        selections: read.selections.map((selection) => ({
          name: selection.name.trimEnd(),
          text: selection.text,
          ddic_reference: selection.ddicReference,
        })),
      };
    case 'headings':
      return {
        headings: {
          list_header: read.headings.listHeader,
          column_header_1: read.headings.columnHeader1,
          column_header_2: read.headings.columnHeader2,
          column_header_3: read.headings.columnHeader3,
          column_header_4: read.headings.columnHeader4,
        },
      };
  }
}

export async function handleGetTextElements(
  context: HandlerContext,
  args: GetTextElementsArgs,
) {
  const { connection, logger } = context;
  const { object_kind: kind, version = 'active' } = args;
  const objectName = args.object_name.toUpperCase();
  const parts = args.parts ?? partsOf(kind);
  const client = textElementsClientOf(connection, logger);

  /** One part's read, with its part's reading. */
  const readPart = (
    part: TextElementsPart,
  ): Promise<
    IAdtResponse<
      ITextSymbolsDocument | ISelectionTextsDocument | ITextHeadingsDocument,
      IAdtError
    >
  > => {
    const options = { analyse: analyseException };
    const object = textObject(kind, objectName);
    switch (part) {
      case 'symbols':
        return client
          .getTextElements({ ...textElementsDocuments, source: textSymbols })
          .read({ ...object, part }, version, options);
      case 'selections':
        return client
          .getTextElements({ ...textElementsDocuments, source: selectionTexts })
          .read(withPart(object, part), version, options);
      case 'headings':
        return client
          .getTextElements({ ...textElementsDocuments, source: textHeadings })
          .read(withPart(object, part), version, options);
    }
  };

  const readAll = async (): Promise<
    IAdtResponse<TextElementsAnswer, IAdtError>
  > => {
    let read: TextElementsAnswer = {};
    for (const part of parts) {
      const one = await readPart(part);
      if (!one.ok) return one;
      read = { ...read, ...partAnswer(one.getResult().value) };
    }
    return succeeded(read, 'GetTextElements');
  };

  return answer(
    { tool: 'GetTextElements', detail: 'terse' },
    readAll,
    (read) => ({
      success: true,
      object_kind: kind,
      object_name: objectName,
      version,
      ...read,
    }),
  );
}

/** The object a read addresses. */
function textObject(kind: ObjectKind, objectName: string) {
  return { objectKind: libraryKind(kind), objectName };
}

/**
 * The part config of a program's or a function group's part other than the
 * symbols: the schema refuses those parts for a class (`partsOf`).
 */
function withPart(
  object: ReturnType<typeof textObject>,
  part: 'selections' | 'headings',
) {
  if (object.objectKind === 'class') {
    throw new Error(`A class has no ${part}: it has symbols`);
  }
  return { objectKind: object.objectKind, objectName: object.objectName, part };
}
