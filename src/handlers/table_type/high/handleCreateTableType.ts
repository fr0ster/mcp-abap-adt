/**
 * CreateTableType Handler - ABAP Table Type Creation via ADT API
 *
 * As `CreateDomain`, end to end: validate the name, create the bare object,
 * lock it, read the document SAP created, patch the properties the caller
 * gave and write it back under the lock (through `withLock`, released on
 * every path out), wait for the write to be visible, check the inactive
 * version, and activate unless `activate` is false.
 *
 * **One difference from `CreateDomain`: no defaults.** The domain declares
 * schema defaults for its definition and fills them in code; the MCP SDK
 * fills a declared default into the arguments, so a property "not given"
 * would always be given. Here only `activate` declares one: every definition
 * property not given leaves SAP's value, because `patchTableTypeXml` leaves
 * an absent property untouched. The values are passed as given — which ones
 * SAP takes is SAP's answer.
 *
 * The wait is `readMetadata({withLongPolling: true})`, discarded for its
 * result but not for what it does (see `handleCreateDomain.ts` and
 * `xmlPatch.ts`): it sits right before `check`, the first call that reads
 * the write back.
 */

import { tableTypeDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer, unlessCredentialFailure } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { patchTableTypeXml } from '../../../lib/strategies/tableTypePatch';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';

/**
 * The definition properties a table type takes, shared with `UpdateTableType`
 * so the two tools describe them in the same words. Each is passed as given.
 */
export const TABLE_TYPE_DEFINITION_PROPERTIES = {
  row_type_kind: {
    type: 'string',
    description:
      'Kind of the row type (ttyp:rowType/ttyp:typeKind), passed to SAP as given.',
  },
  row_type_name: {
    type: 'string',
    description:
      'Dictionary type used as the row type (ttyp:rowType/ttyp:typeName).',
  },
  data_type: {
    type: 'string',
    description:
      'Built-in data type of the row (ttyp:builtInType/ttyp:dataType).',
  },
  length: {
    type: 'number',
    description:
      'Length of the built-in row type (ttyp:builtInType/ttyp:length).',
  },
  decimals: {
    type: 'number',
    description:
      'Decimal places of the built-in row type (ttyp:builtInType/ttyp:decimals).',
  },
  access_type: {
    type: 'string',
    description:
      'Access type of the table (ttyp:accessType), passed to SAP as given.',
  },
  key_definition: {
    type: 'string',
    description:
      'Definition of the primary key (ttyp:primaryKey/ttyp:definition), passed to SAP as given.',
  },
  key_kind: {
    type: 'string',
    description:
      'Kind of the primary key (ttyp:primaryKey/ttyp:kind), passed to SAP as given.',
  },
} as const;

export const TOOL_DEFINITION = {
  name: 'CreateTableType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Creates the ABAP table type named by table_type_name in package_name, writes the given definition properties (row type, access type, primary key) into the document SAP created, checks it, and activates it when activate is true (the default). Every property left out keeps SAP's value. Returns SAP's answer to each step.",
  inputSchema: {
    type: 'object',
    properties: {
      table_type_name: {
        type: 'string',
        description: 'Table type name.',
      },
      package_name: {
        type: 'string',
        description: 'Package the table type is created in.',
      },
      description: {
        type: 'string',
        description:
          'Table type description. When left out, table_type_name is used.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number, not a task. Required for transportable packages.',
      },
      ...TABLE_TYPE_DEFINITION_PROPERTIES,
      activate: {
        type: 'boolean',
        description: 'Activate the table type after creation (default: true).',
        default: true,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_type_name', 'package_name'],
  },
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface CreateTableTypeArgs {
  table_type_name?: string;
  package_name?: string;
  description?: string;
  transport_request?: string;
  row_type_kind?: string;
  row_type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  access_type?: string;
  key_definition?: string;
  key_kind?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateTableType(
  context: HandlerContext,
  args: CreateTableTypeArgs,
) {
  const { connection, logger } = context;

  if (!args.table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }
  if (!args.package_name) {
    return return_error(new Error('package_name is required'));
  }

  const tableTypeName = args.table_type_name.toUpperCase();
  const packageName = args.package_name;
  const description = args.description || tableTypeName;
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateTableType', detail },
    async () => {
      const obj = createAdtClient(connection, logger).getTableType(
        resultsFor(tableTypeDocuments),
      );

      const checked = await sequence(
        atStep('validate', () =>
          obj.validate(
            { tableTypeName, description, packageName },
            { analyse: analyseException },
          ),
        ),
        atStep('create', () =>
          withAdtHeaders(context, 'tableType.create', (headers) =>
            obj.create(
              {
                tableTypeName,
                description,
                packageName,
                transportRequest: args.transport_request,
              },
              { headers, analyse: analyseException },
            ),
          ),
        ),
        () =>
          withLock(
            () => obj.lock({ tableTypeName }, { analyse: analyseLock }),
            (lockHandle) =>
              sequence(
                atStep('read metadata', () =>
                  obj.readMetadata(
                    { tableTypeName },
                    { analyse: analyseException },
                  ),
                ),
                atStep('update metadata', (current) =>
                  withAdtHeaders(
                    context,
                    'tableType.updateMetadata',
                    (headers) =>
                      obj.updateMetadata(
                        {
                          tableTypeName,
                          transportRequest: args.transport_request,
                        },
                        {
                          headers,
                          source: patchTableTypeXml(
                            extractXmlString(
                              current.raw,
                              `table type ${tableTypeName}`,
                            ),
                            {
                              description: args.description,
                              row_type_kind: args.row_type_kind,
                              row_type_name: args.row_type_name,
                              data_type: args.data_type,
                              length: args.length,
                              decimals: args.decimals,
                              access_type: args.access_type,
                              key_definition: args.key_definition,
                              key_kind: args.key_kind,
                            },
                          ),
                          lockHandle,
                          analyse: analyseException,
                        },
                      ),
                  ),
                ),
              ),
            (lockHandle) =>
              obj.unlock({ tableTypeName }, lockHandle, {
                analyse: analyseException,
              }),
            { type: 'TABLE_TYPE', name: tableTypeName },
          ),
        // Best-effort (a credential failure ends the call): wait for the
        // write to be visible right before the first call that reads it
        // back, as `CreateDomain` does.
        atStep('check', async () => {
          await obj
            .readMetadata(
              { tableTypeName },
              { withLongPolling: true, analyse: analyseException },
            )
            .catch(unlessCredentialFailure);
          return withAdtHeaders(context, 'tableType.check', (headers) =>
            obj.check({ tableTypeName }, undefined, {
              headers,
              analyse: analyseException,
            }),
          );
        }),
      );

      if (!checked.ok || !shouldActivate) return checked;

      return carryCleanup(
        checked,
        atStep('activate', () =>
          withAdtHeaders(context, 'tableType.activate', (headers) =>
            obj.activate(
              { tableTypeName },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
