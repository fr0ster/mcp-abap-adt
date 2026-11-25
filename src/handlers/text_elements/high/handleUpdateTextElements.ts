/**
 * UpdateTextElements - write a program's, function group's or class's text
 * elements.
 *
 * One call: LOCK the object's text elements, PUT each part given, UNLOCK,
 * then activate the object together with its text elements when `activate`
 * is true and the release was clean.
 *
 * - **Their own lock.** The text elements are locked at their own address, as
 *   `TEXT` (Code: `lcl_access_permission->modify`,
 *   `cl_adt_lock_handle=>get_instance( 'TEXT' )`, `RS_ACCESS_PERMISSION …
 *   object_class = 'TEXT'`; measured: LOCK and UNLOCK 200 on premise and on
 *   the cloud, 2026-11-19). The cloud's LOCK answers
 *   `MODIFICATION_SUPPORT=NoModification` and the PUT is still saved
 *   (measured on the cloud, a class and a function group).
 * - **A part is written whole.** SAP deletes every entry the body leaves out
 *   (Code, both systems: `lcl_textpool->save`; measured on both), so each
 *   part given is the part's whole list.
 * - **The texts are the original language's** (see `textElementsShared`).
 * - **A write lands inactive, beside its object.** After a selections PUT the
 *   inactive list holds the program and its text elements, and an activation
 *   naming the program alone runs nothing; naming both activates both
 *   (measured on premise; a function group and a class the same on premise
 *   and on the cloud, `texts-translation.md` §8, §10, §12.1, §13, §14).
 *   `textElementsActivationReferences` builds the pair; one synchronous
 *   `POST /sap/bc/adt/activation` carries it (measured on both).
 * - **SAP's refusals reach the answer as SAP gives them**: a selection name
 *   over 8 (406 `SEDX_ADT/102`), a selection text over 30 (406
 *   `SEDX_ADT/110`), a symbol text longer than its maximum length (406
 *   `DS/512`), a heading key outside the five (406 `SEDX_ADT/101`) — measured
 *   on both systems, nothing saved.
 */

import {
  textElementsActivationReferences,
  textElementsDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtResponse,
  ITextElementsUpdateConfig,
  TextElementsDocument,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import { answer } from '../../../lib/answer';
import {
  createAdtClient,
  createOnPremAdtClient,
  textElementsClientOf,
} from '../../../lib/clients';
import { updateTool } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { cleanupOf, failed } from '../../../lib/strategies/stepResponse';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { byVariant } from '../../../lib/variantDefinition';
import {
  HEADINGS,
  libraryKind,
  OBJECT_KINDS,
  OBJECT_NAME_FIELD,
  type ObjectKind,
  SELECTIONS,
  SYMBOLS,
} from '../textElementsShared';

/** The object kinds UpdateTextElements writes on `variant`. */
function kindsOn(variant: ProjectionVariant) {
  // ABAP Cloud has no program of the customer's to write: a write to a
  // delivered program is refused by the text elements' lock
  // (`RS_ACCESS_PERMISSION`, `RS_EXTEND_CHECK`, Code on the cloud), never
  // measured on a delivered object, by rule.
  return variant === 'cloud'
    ? (['function_group', 'class'] as const)
    : OBJECT_KINDS;
}

/** UpdateTextElements' schema on `variant`. */
function updateSchema(variant: ProjectionVariant) {
  return z
    .object({
      object_kind: z
        .enum(kindsOn(variant))
        .describe(`Kind of object: ${kindsOn(variant).join(', ')}.`),
      object_name: OBJECT_NAME_FIELD,
      symbols: SYMBOLS,
      selections: SELECTIONS,
      headings: HEADINGS,
      transport_request: z
        .string()
        .optional()
        .describe(
          'Transport request number, not a task. Optional if the object is local or already in a transport request.',
        ),
      activate: z
        .boolean()
        .describe(
          'true activates the object together with its text elements after the write; false leaves them inactive.',
        ),
      ...DETAIL_SHAPE,
    })
    .superRefine((args, ctx) => {
      if (
        args.symbols === undefined &&
        args.selections === undefined &&
        args.headings === undefined
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Give at least one of symbols, selections, headings',
          path: ['symbols'],
        });
      }
      if (
        args.object_kind === 'class' &&
        (args.selections !== undefined || args.headings !== undefined)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'A class has text symbols only',
          path: ['object_kind'],
        });
      }
    });
}

/** A part SAP saved, and the list saved for it. */
type SavedPart = { part: string; saved: string };

export const TOOL_DEFINITION = {
  name: 'UpdateTextElements',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: updateTool({
      object:
        'the text elements of an existing ABAP program, function group or class',
      how: ', each part given replacing its stored one, activating the object when asked',
    }),
    inputSchema: updateSchema(variant),
  })),
} as const;

type UpdateTextElementsArgs = z.output<ReturnType<typeof updateSchema>>;

/** The parts the arguments give, in a fixed order: symbols, selections, headings. */
function documentsOf(args: PartsArgs): TextElementsDocument[] {
  const symbols: TextElementsDocument[] =
    args.symbols === undefined
      ? []
      : [
          {
            part: 'symbols',
            symbols: args.symbols.map((symbol) => ({
              key: symbol.key,
              text: symbol.text,
              maxLength: symbol.max_length,
            })),
          },
        ];
  const selections: TextElementsDocument[] =
    args.selections === undefined
      ? []
      : [
          {
            part: 'selections',
            selections: args.selections.map((selection) => ({
              name: selection.name,
              text: selection.text,
              ddicReference: selection.ddic_reference === true,
            })),
          },
        ];
  const headings: TextElementsDocument[] =
    args.headings === undefined
      ? []
      : [
          {
            part: 'headings',
            headings: {
              listHeader: args.headings.list_header ?? '',
              columnHeader1: args.headings.column_header_1 ?? '',
              columnHeader2: args.headings.column_header_2 ?? '',
              columnHeader3: args.headings.column_header_3 ?? '',
              columnHeader4: args.headings.column_header_4 ?? '',
            },
          },
        ];
  return [...symbols, ...selections, ...headings];
}

/**
 * The part writes the arguments ask for, each addressed to the object. A
 * class takes its symbols alone: the schema refuses its other parts.
 */
function partWrites(
  kind: ObjectKind,
  objectName: string,
  args: PartsArgs,
): ITextElementsUpdateConfig[] {
  const transport =
    args.transport_request === undefined
      ? {}
      : { transportRequest: args.transport_request };
  const documents = documentsOf(args);
  switch (kind) {
    case 'class':
      return documents.flatMap((document) =>
        document.part === 'symbols'
          ? [
              {
                objectKind: 'class' as const,
                objectName,
                ...transport,
                ...document,
              },
            ]
          : [],
      );
    case 'program':
      return documents.map((document) => ({
        objectKind: 'program' as const,
        objectName,
        ...transport,
        ...document,
      }));
    case 'function_group':
      return documents.map((document) => ({
        objectKind: 'functionGroup' as const,
        objectName,
        ...transport,
        ...document,
      }));
  }
}

/** The header pair's operation of each part's write. */
const PART_OPERATION = {
  symbols: 'textSymbols.update',
  selections: 'selectionTexts.update',
  headings: 'textHeadings.update',
} as const;

/** The text elements handler of `connection`, with this tool's result set. */
function textsOf(context: Pick<HandlerContext, 'connection' | 'logger'>) {
  return textElementsClientOf(
    context.connection,
    context.logger,
  ).getTextElements(resultsFor(textElementsDocuments));
}

/** The text elements handler UpdateTextElements writes through. */
type TextsHandler = ReturnType<typeof textsOf>;

/** What a write of parts reads of its arguments. */
type PartsArgs = Pick<
  UpdateTextElementsArgs,
  | 'object_kind'
  | 'object_name'
  | 'symbols'
  | 'selections'
  | 'headings'
  | 'transport_request'
>;

/** A part SAP saved: the part and SAP's answer to its PUT, which echoes the list saved. */

/**
 * One PUT per part given, in order, under `lockHandle`; the first refused
 * ends the writes, its step naming the part (the parts before it are
 * saved). A call giving no part is refused, nothing sent.
 */
async function writeParts(
  context: HandlerContext,
  texts: TextsHandler,
  args: PartsArgs,
  lockHandle: string,
  saved: SavedPart[] = [],
): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> {
  let last: IAdtResponse<AdtReading<unknown>, IAdtError> = failed(
    {
      message: 'Give at least one of symbols, selections, headings',
      origin: 'refusal',
      step: 'update',
    },
    'UpdateTextElements',
  );
  for (const config of partWrites(
    args.object_kind,
    args.object_name.toUpperCase(),
    args,
  )) {
    last = await atStep(`update ${config.part}`, () =>
      withAdtHeaders(context, PART_OPERATION[config.part], (headers) =>
        texts.update(config, {
          headers,
          lockHandle,
          analyse: analyseException,
        }),
      ),
    )();
    if (!last.ok) return last;
    saved.push({ part: config.part, saved: last.getResult().value?.raw ?? '' });
  }
  return last;
}

/**
 * The text elements' write under a lock the caller holds (compact
 * HandlerUpdate): one PUT per part given, no lock, unlock or activation of
 * its own.
 */
export function writeTextElementsUnderLock(
  context: HandlerContext,
  args: PartsArgs,
  lockHandle: string,
) {
  return writeParts(context, textsOf(context), args, lockHandle);
}

export async function handleUpdateTextElements(
  context: HandlerContext,
  args: UpdateTextElementsArgs,
) {
  const { connection, logger } = context;
  const kind = args.object_kind;
  const objectName = args.object_name.toUpperCase();
  const detail = detailOf(args);
  const object = { objectKind: libraryKind(kind), objectName };

  // Each part SAP saved, answered beside the call's outcome: a refused part
  // leaves the parts before it saved (inactive), and an activation adds its
  // messages beside them.
  const saved: SavedPart[] = [];
  return answer(
    {
      tool: 'UpdateTextElements',
      detail,
      beside: () =>
        saved.length > 0
          ? {
              parts: saved.map(({ part, saved: text }) => ({
                part,
                saved: text,
              })),
            }
          : undefined,
    },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const texts = textElementsClientOf(connection, logger).getTextElements(
        resultsFor(textElementsDocuments),
      );

      const written = await withLock(
        () => texts.lock(object, { analyse: analyseLock }),
        (lockHandle) => writeParts(context, texts, args, lockHandle, saved),
        (lockHandle) =>
          texts.unlock(object, lockHandle, { analyse: analyseException }),
        { type: 'TEXT', name: objectName },
      );

      // The object is activated only after a clean release: text elements
      // SAP may still hold locked leave the answer to the caller, with the
      // lock.
      if (!written.ok || !args.activate || cleanupOf(written) !== undefined) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'utils.activateObjects', (headers) =>
            object.objectKind === 'program'
              ? createOnPremAdtClient(connection, logger)
                  .getUtils(ourUtils)
                  .activateObjects(
                    textElementsActivationReferences({
                      objectKind: 'program',
                      objectName,
                    }),
                    true,
                    { headers, analyse: analyseActivation },
                  )
              : createAdtClient(connection, logger)
                  .getUtils(ourUtils)
                  .activateObjects(
                    textElementsActivationReferences({
                      objectKind: object.objectKind,
                      objectName,
                    }),
                    true,
                    { headers, analyse: analyseActivation },
                  ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
