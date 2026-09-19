/**
 * UpdateDataElement Handler - Update ABAP Data Element Properties
 *
 * Read, patch, write. adt-clients 19 removed the merge that used to happen
 * inside `updateDataElement`: the member takes the whole document now and
 * replaces with it, so anything not sent is gone. The sequence is the
 * handler's, and every step of it carries its own `analyse` — the verdict on
 * each answer stays the strategy's.
 *
 * **The patched document goes in `config.document`, not `options.xmlContent`.**
 * `AdtDataElement.updateMetadata()`'s shipped body reads `config.document`
 * only and passes it straight to `updateDataElement(connection, {...},
 * config.document, options?.lockHandle)` as the PUT body — the fields beside
 * it in `config` (`packageName`, `description`, `typeKind`, …) describe a
 * create and are never read to build or merge a body on an update; only
 * `data_element_name` and `transport_request` (for the write-query string)
 * reach the wire function at all. `options` declares no `xmlContent` field
 * either. Verified against the compiled `AdtDataElement.js` and
 * `core/dataElement/update.js`, not the declaration file — the exact mistake
 * found four times in cluster 14 and once more in domain (fix round 3, task
 * 14) is the one this handler avoids by construction.
 *
 * **No corpus fixture exists for `GET /sap/bc/adt/ddic/dataelements/{name}`**
 * (the read half of this sequence) — the corpus has a data element `create`
 * response (`create-dataelement--01-ddic-dataelements`) but never a
 * metadata read. The `dtel:`-tagged document `patchDataElementXml` patches
 * is ported field-for-field from `v18.0.2`'s own patcher (see
 * `dataElementPatch.ts`), and the tests exercising this sequence build a
 * hand-written document with those same tags rather than a captured one —
 * the same disclosure `CreateTransportLow` makes for its own missing
 * fixture, made here for the same reason.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type DataElementChanges,
  patchDataElementXml,
} from '../../../lib/strategies/dataElementPatch';
import { sequence } from '../../../lib/strategies/sequence';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description:
          'Data element name (e.g., ZOK_E_TEST_0001). Data element must already exist.',
      },
      properties: {
        type: 'object',
        description:
          'Data element properties object. Can include: description, type_name, type_kind, data_type, field_label_short, field_label_medium, field_label_long, etc.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['data_element_name', 'properties', 'lock_handle'],
  },
} as const;

interface UpdateDataElementArgs {
  data_element_name: string;
  properties: Record<string, any>;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/** `properties` always took both spellings; the patch function only knows snake_case. */
function changesOf(properties: Record<string, any>): DataElementChanges {
  return {
    description: properties.description,
    type_kind: properties.type_kind ?? properties.typeKind,
    type_name: properties.type_name ?? properties.typeName,
    data_type: properties.data_type ?? properties.dataType,
    length: properties.length,
    decimals: properties.decimals,
    short_label:
      properties.field_label_short ??
      properties.short_label ??
      properties.shortLabel,
    medium_label:
      properties.field_label_medium ??
      properties.medium_label ??
      properties.mediumLabel,
    long_label:
      properties.field_label_long ??
      properties.long_label ??
      properties.longLabel,
    heading_label:
      properties.field_label_heading ??
      properties.heading_label ??
      properties.headingLabel,
    search_help: properties.search_help ?? properties.searchHelp,
    search_help_parameter:
      properties.search_help_parameter ?? properties.searchHelpParameter,
    set_get_parameter:
      properties.set_get_parameter ?? properties.setGetParameter,
  };
}

export async function handleUpdateDataElement(
  context: HandlerContext,
  args: UpdateDataElementArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      data_element_name,
      properties,
      lock_handle,
      session_id,
      session_state,
    } = args as UpdateDataElementArgs;

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

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    const transportRequest =
      properties.transport_request || properties.transportRequest;
    const changes = changesOf(properties);

    try {
      // The three steps, in the handler because 19 put them there. `analyse`
      // on each one: a refusal from the read and a refusal from the write are
      // different failures, and whichever comes back is the one the caller
      // sees, built by the strategy rather than summarised here.
      const written = await sequence(
        () =>
          client
            .getDataElement()
            .readMetadata({ dataElementName }, { analyse: analyseException }),
        (current) =>
          client.getDataElement().updateMetadata(
            {
              dataElementName,
              transportRequest,
              document: patchDataElementXml(
                extractXmlString(current, `data element ${dataElementName}`),
                changes,
              ),
            },
            {
              lockHandle: lock_handle,
              analyse: analyseException,
            },
          ),
      );

      if (!written.ok) {
        const failure = written.getError();
        logger?.error(`UpdateDataElement refused: ${failure.message}`);
        return return_error(new Error(failure.message));
      }

      logger?.info(`✅ UpdateDataElement completed: ${dataElementName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            data_element_name: dataElementName,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `DataElement ${dataElementName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      // `sequence()`'s two calls each carry their own `analyse` and never
      // throw for a refusal — `written.ok`/`written.getError()` above is
      // where that verdict is read. This catch is left for a genuine bug in
      // this block, not for a wire refusal, so it no longer guesses an HTTP
      // status or re-parses an `exc` namespace `exception` element out of a body no v19 call here
      // can still produce — that read belongs to `analyseException`, not a
      // second opinion here (found while writing the handler invariant that
      // checks for exactly this).
      const message = error?.message ?? String(error);
      logger?.error(
        `Error updating data element ${dataElementName}: ${message}`,
      );
      return return_error(
        new Error(`Failed to update data element: ${message}`),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
