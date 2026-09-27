/**
 * CreateTable Handler - ABAP Table Creation via ADT API
 *
 * Uses AdtClient.getTable().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it. The pre-migration handler's own `validate()`
 * call is dropped — this is a bare create, matching `CreateTableLow`.
 *
 * **`description` reaches nothing.** The shipped `createTable` reads five
 * fields — table name, package, transport, master and responsible — plus
 * `masterLanguage`; `description` is not among them. Kept on this tool's
 * schema for compatibility, but not forwarded. No source, no DDL — that is
 * `UpdateTable`'s job, after `LockTable`. Verified against `AdtTable.js`.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: Table. Will be useful for creating table. Create a new ABAP table in SAP system. Creates the table object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description:
          'Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description:
          'Does not reach creation — the shipped create endpoint has no description field of its own. Use UpdateTable (with ddl_code) after creating to set the DDL source, which carries the description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_name', 'package_name'],
  },
} as const;

interface CreateTableArgs {
  table_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateTable(
  context: HandlerContext,
  args: CreateTableArgs,
) {
  const { connection, logger } = context;

  if (!args?.table_name) {
    return return_error(new Error('table_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const tableName = args.table_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateTable', detail },
    () =>
      createAdtClient(connection, logger)
        .getTable(resultsFor(tableDocuments))
        .create(
          {
            tableName,
            packageName: args.package_name,
            transportRequest: args.transport_request,
            masterLanguage: args.master_language,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
