import {
  dataElementDocuments,
  patchDataElementDocument,
} from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
/**
 * UpdateDataElement Handler - Update ABAP Data Element Properties
 *
 * Read, patch, write. adt-clients 19 removed the merge that used to happen
 * inside `updateDataElement`: the member takes the whole document now and
 * replaces with it, so anything not sent is gone. The sequence is the
 * handler's, and every step of it carries its own `analyse` — the verdict on
 * each answer stays the strategy's.
 *
 * **The patched document goes in `options.source`.** `interfaces-adt@9`
 * merged the old `config.document`/`options.sourceCode` split into one
 * channel (decision 33) and took `document` off `IDataElementConfig`, so the
 * old shape no longer compiles. `AdtDataElement.updateMetadata()` reads
 * `options?.source` and passes it straight to `updateDataElement(connection,
 * {...}, source, options?.lockHandle)` as the PUT body — the fields beside it
 * in `config` (`packageName`, `description`, `typeKind`, …) describe a create
 * and are never read to build or merge a body on an update; only
 * `data_element_name` and `transport_request` (for the write-query string)
 * reach the wire function at all. Verified against `AdtDataElement.ts` and
 * `core/dataElement/update.ts` in adt-clients 22 — the empty-write mistake
 * found four times in cluster 14 and once more in domain (fix round 3, task
 * 14) is the one this handler avoids by construction, and the contract now
 * refuses it outright.
 *
 * The document read is patched by adt-clients' `patchDataElementDocument`
 * (`documentPatch.ts`); a refused patch is the failure of the step `patch`,
 * and nothing is written.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answerFailure,
  answerThrown,
  messageCarriedBy,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { givenCount, givenText } from '../../../lib/propertyBag';
import {
  type DataElementChanges,
  type DataElementTypeKind,
  dataElementChanges,
} from '../../../lib/strategies/documentChanges';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: z.object({
    data_element_name: z
      .string()
      .describe('Data element name. Data element must already exist.'),
    properties: z
      .unknown()
      .describe(
        'Data element properties object. Can include: description, type_name, type_kind, data_type, field_label_short, field_label_medium, field_label_long, etc.',
      ),
    lock_handle: z
      .string()
      .describe('Lock handle from LockObject. Required for update operation.'),
  }),
} as const;

/** The tool's arguments, as its schema parses them. */
type UpdateDataElementArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** The type kinds SAP knows for a data element. */
const TYPE_KINDS: ReadonlyArray<DataElementTypeKind> = [
  'domain',
  'predefinedAbapType',
  'refToPredefinedAbapType',
  'refToDictionaryType',
  'refToClifType',
];

/** `text` as a type kind SAP knows, or none. */
function typeKindOf(text: string): DataElementTypeKind | undefined {
  return TYPE_KINDS.find((kind) => kind === text);
}

/**
 * `properties` always took both spellings; the patch function only knows
 * snake_case. Each member as the patch writes it: text, a length or a count
 * a number (or its digits); a value of no such kind is left out. The type
 * kind is read apart (`typeKindOf`): one SAP does not know is refused.
 */
function changesOf(
  properties: unknown,
  typeKind: DataElementTypeKind | undefined,
): DataElementChanges {
  return {
    description: givenText(properties, 'description'),
    type_kind: typeKind,
    type_name: givenText(properties, 'type_name', 'typeName'),
    data_type: givenText(properties, 'data_type', 'dataType'),
    length: givenCount(properties, 'length'),
    decimals: givenCount(properties, 'decimals'),
    short_label: givenText(
      properties,
      'field_label_short',
      'short_label',
      'shortLabel',
    ),
    medium_label: givenText(
      properties,
      'field_label_medium',
      'medium_label',
      'mediumLabel',
    ),
    long_label: givenText(
      properties,
      'field_label_long',
      'long_label',
      'longLabel',
    ),
    heading_label: givenText(
      properties,
      'field_label_heading',
      'heading_label',
      'headingLabel',
    ),
    search_help: givenText(properties, 'search_help', 'searchHelp'),
    search_help_parameter: givenText(
      properties,
      'search_help_parameter',
      'searchHelpParameter',
    ),
    set_get_parameter: givenText(
      properties,
      'set_get_parameter',
      'setGetParameter',
    ),
  };
}

export async function handleUpdateDataElement(
  context: HandlerContext,
  args: UpdateDataElementArgs,
) {
  const { connection, logger } = context;
  try {
    const { data_element_name, properties, lock_handle } = args;

    if (!data_element_name || !properties || !lock_handle) {
      return return_error(
        new Error(
          'data_element_name, properties, and lock_handle are required',
        ),
      );
    }

    const client = createAdtClient(connection, logger);

    const dataElementName = data_element_name.toUpperCase();

    logger?.info(`Starting data element update: ${dataElementName}`);

    const transportRequest =
      givenText(properties, 'transport_request') ||
      givenText(properties, 'transportRequest');
    const typeKindText = givenText(properties, 'type_kind', 'typeKind');
    const typeKind =
      typeKindText === undefined ? undefined : typeKindOf(typeKindText);
    if (typeKindText !== undefined && typeKind === undefined) {
      return return_error(
        new Error(
          `properties.type_kind must be one of ${TYPE_KINDS.join(', ')}; nothing was sent`,
        ),
      );
    }
    const changes = changesOf(properties, typeKind);

    try {
      // The three steps, in the handler because 19 put them there. `analyse`
      // on each one: a refusal from the read and a refusal from the write are
      // different failures, and whichever comes back is the one the caller
      // sees, built by the strategy rather than summarised here.
      const written = await sequence(
        atStep('read metadata', () =>
          client
            .getDataElement(dataElementDocuments)
            .readMetadata(
              { dataElementName },
              { version: 'workingArea', analyse: analyseException },
            ),
        ),
        async (current) =>
          patchedDocument(
            patchDataElementDocument(current, dataElementChanges(changes)),
            `data element ${dataElementName}`,
          ),
        atStep('update metadata', (document) =>
          withAdtHeaders(context, 'dataElement.updateMetadata', (headers) =>
            client.getDataElement(dataElementDocuments).updateMetadata(
              {
                dataElementName,
                transportRequest,
              },
              {
                headers,
                source: document,
                lockHandle: lock_handle,
                analyse: analyseException,
              },
            ),
          ),
        ),
      );

      if (!written.ok) {
        const failure = written.getError();
        logger?.error(`UpdateDataElement refused: ${failure.message}`);
        // The method's error as it is, with the step it arose at.
        return answerFailure(failure, {
          tool: 'UpdateDataElementLow',
          detail: 'terse',
        });
      }

      logger?.info(`✅ UpdateDataElement completed: ${dataElementName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            data_element_name: dataElementName,
            message: `DataElement ${dataElementName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      });
    } catch (error) {
      // `sequence()`'s two calls each carry their own `analyse` and never
      // throw for a refusal — `written.ok`/`written.getError()` above is
      // where that verdict is read. This catch is left for a genuine bug in
      // this block, not for a wire refusal, so it no longer guesses an HTTP
      // status or re-parses an `exc` namespace `exception` element out of a body no v19 call here
      // can still produce — that read belongs to `analyseException`, not a
      // second opinion here (found while writing the handler invariant that
      // checks for exactly this).
      const message = messageCarriedBy(error);
      logger?.error(
        `Error updating data element ${dataElementName}: ${message}`,
      );
      return answerThrown(error, {
        tool: 'UpdateDataElementLow',
        detail: 'terse',
      });
    }
  } catch (error) {
    return return_error(error);
  }
}
