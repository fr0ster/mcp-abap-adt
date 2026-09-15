/**
 * CreateDataElement Handler - Create ABAP Data Element
 *
 * Uses AdtClient.getDataElement().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim` (not `statusOnly` — a DDIC create answers a
 * document, measured at 1345 bytes for `create-dataelement--01-ddic-
 * dataelements`), so `project(detail, terseWrite)` still reads the status
 * for `terse` while `full`/`raw` now answer the document ADT actually sent
 * instead of discarding it.
 *
 * **`type_kind`/`data_type`/`type_name`/`length`/`decimals` never reach the
 * wire on a create, and never have.** Read against the shipped
 * `core/dataElement/create.js`: the wire-level `create()` function builds its
 * XML body from `data_element_name`, `description`, `package_name`,
 * `masterLanguage`/`masterSystem`/`responsible` and the `transport_request`
 * query param only — nothing else in `ICreateDataElementParams` is read.
 * Checked against `v18.0.2` of `@mcp-abap-adt/adt-clients` too: identical, so
 * this is not something 19 changed. "Create sends minimal XML (root element +
 * packageRef only). Type details … are set via update after creation,
 * matching Eclipse ADT behavior" is the shipped comment on both versions.
 * The parameters stay on this tool's surface (the ratchet compares names,
 * not descriptions) with descriptions corrected to say so — a caller who
 * wants them applied calls `UpdateDataElementLow` next, exactly the sibling
 * pattern `CreateDdlLow`/`CreateStructureLow`/`CreateTableLow` already use
 * for their own create-time fields.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP data element. - use CreateDataElement (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description:
          'DataElement name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'DataElement description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      data_type: {
        type: 'string',
        description:
          'Does not reach creation — the shipped create endpoint never reads it (only sends name/description/package/transport). Use UpdateDataElementLow (with lock_handle) after creating to set the data type or domain name.',
      },
      type_kind: {
        type: 'string',
        description:
          "Does not reach creation — the shipped create endpoint never reads it. Use UpdateDataElementLow (with lock_handle) after creating to set the type kind ('E'/'domain', 'P'/'predefinedAbapType', etc.).",
      },
      type_name: {
        type: 'string',
        description:
          'Does not reach creation — the shipped create endpoint never reads it. Use UpdateDataElementLow (with lock_handle) after creating to set the type name (domain, data element, or class name depending on type_kind).',
      },
      length: {
        type: 'number',
        description:
          'Does not reach creation — the shipped create endpoint never reads it. Use UpdateDataElementLow (with lock_handle) after creating to set the data type length.',
      },
      decimals: {
        type: 'number',
        description:
          'Does not reach creation — the shipped create endpoint never reads it. Use UpdateDataElementLow (with lock_handle) after creating to set the decimal places.',
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
      ...DETAIL_PROPERTY,
    },
    required: ['data_element_name', 'description', 'package_name'],
  },
} as const;

interface CreateDataElementArgs {
  data_element_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  data_type?: string;
  type_kind?: string;
  type_name?: string;
  length?: number;
  decimals?: number;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateDataElement(
  context: HandlerContext,
  args: CreateDataElementArgs,
) {
  const { connection, logger } = context;
  const {
    data_element_name,
    description,
    package_name,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (!data_element_name || !description || !package_name) {
    return return_error(
      new Error(
        'data_element_name, description, and package_name are required',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const dataElementName = data_element_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateDataElementLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDataElement(resultsFor(dataElementDocuments))
        .create(
          {
            dataElementName,
            description,
            packageName: package_name,
            transportRequest: transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
