import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
 * The wait is `readMetadata({withLongPolling: true})` (see
 * `handleCreateDomain.ts` and `xmlPatch.ts`): it sits right before `check`,
 * the first call that reads the write back. Its document, the inactive
 * version, is the definition SAP stored, answered beside the result; after
 * a successful activation one read of the active version answers it instead
 * (`tableTypeStored.ts`).
 */

import { tableTypeDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { patchTableTypeXml } from '../../../lib/strategies/tableTypePatch';
import {
  readStoredDefinition,
  type StoredDefinitionAnswer,
} from '../../../lib/strategies/tableTypeStored';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';

/**
 * The values SAP takes for the four closed definition properties. Measured on
 * premise, 2026-11-01: SAP answers SUCCESS to any other value and stores
 * another value, so this `enum` is the only
 * guard. `keyComponents` is left out of `key_definition`: SAP refuses to
 * activate it without key components, which these tools cannot set. The two
 * range kinds are stored; whether they activate depends on the row type given,
 * and SAP's answer reaches the model as sent. `row_type_name` and `data_type`
 * are open (SAP names an unknown data type in its refusal).
 */
export const ROW_TYPE_KINDS = [
  'predefinedAbapType',
  'dictionaryType',
  'refToPredefinedAbapType',
  'refToDictionaryType',
  'refToClassOrInterfaceType',
  'rangeTypeOnPredefinedType',
  'rangeTypeOnDataelement',
] as const;
export const ACCESS_TYPES = [
  'standard',
  'sorted',
  'hashed',
  'index',
  'notSpecified',
] as const;
export const KEY_DEFINITIONS = [
  'standard',
  'rowType',
  'empty',
  'notSpecified',
] as const;
export const KEY_KINDS = ['unique', 'nonUnique', 'notSpecified'] as const;

export type RowTypeKind = (typeof ROW_TYPE_KINDS)[number];
export type AccessType = (typeof ACCESS_TYPES)[number];
export type KeyDefinition = (typeof KEY_DEFINITIONS)[number];
export type KeyKind = (typeof KEY_KINDS)[number];

/**
 * The definition properties a table type takes, shared with `UpdateTableType`
 * so the two tools describe them in the same words. Each is passed as given.
 */
export const TABLE_TYPE_DEFINITION_PROPERTIES = {
  row_type_kind: z
    .enum(ROW_TYPE_KINDS)
    .optional()
    .describe('Kind of the row type (ttyp:rowType/ttyp:typeKind).'),
  row_type_name: z
    .string()
    .optional()
    .describe(
      'Dictionary type used as the row type (ttyp:rowType/ttyp:typeName).',
    ),
  data_type: z
    .string()
    .optional()
    .describe(
      'Built-in data type of the row (ttyp:builtInType/ttyp:dataType).',
    ),
  length: z
    .number()
    .optional()
    .describe(
      'Length of the built-in row type (ttyp:builtInType/ttyp:length).',
    ),
  decimals: z
    .number()
    .optional()
    .describe(
      'Decimal places of the built-in row type (ttyp:builtInType/ttyp:decimals).',
    ),
  access_type: z
    .enum(ACCESS_TYPES)
    .optional()
    .describe('Access type of the table (ttyp:accessType).'),
  key_definition: z
    .enum(KEY_DEFINITIONS)
    .optional()
    .describe(
      'Definition of the primary key (ttyp:primaryKey/ttyp:definition).',
    ),
  key_kind: z
    .enum(KEY_KINDS)
    .optional()
    .describe('Kind of the primary key (ttyp:primaryKey/ttyp:kind).'),
};

export const TOOL_DEFINITION = {
  name: 'CreateTableType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Creates the ABAP table type named by table_type_name in package_name, writes the given definition properties (row type, access type, primary key) into the document SAP created, checks it, and activates it when activate is true (the default). Every property left out keeps SAP's value. Returns SAP's answer to each step and the definition SAP stored, with the version it was read at (stored_version): the active version, read after a successful activation; with activate false, a refused check or a refused activation, the inactive version, read after the write. A definition whose read failed is answered with SAP's answer to that read.",
  inputSchema: createArguments('CreateTableType', {
    table_type_name: z.string().describe('Table type name.'),
    package_name: z.string().describe('Package the table type is created in.'),
    description: z
      .string()
      .optional()
      .describe(
        'Table type description. When left out, table_type_name is used.',
      ),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    ...TABLE_TYPE_DEFINITION_PROPERTIES,
    activate: z
      .boolean()
      .default(true)
      .optional()
      .describe('Activate the table type after creation (default: true).'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface CreateTableTypeArgs {
  table_type_name?: string;
  package_name?: string;
  description?: string;
  transport_request?: string;
  row_type_kind?: RowTypeKind;
  row_type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  access_type?: AccessType;
  key_definition?: KeyDefinition;
  key_kind?: KeyKind;
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
  // What the wait after the unlock read of the stored definition.
  let stored: StoredDefinitionAnswer | undefined;

  return answer(
    // The definition SAP stored rides along a success and a failure after
    // the wait alike; a chain that ended before the wait has none.
    { tool: 'CreateTableType', detail, beside: () => stored },
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
                    { version: 'workingArea', analyse: analyseException },
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
                              description,
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
        // Wait for the write to be visible right before the first call that
        // reads it back, as `CreateDomain` does; its document, the inactive
        // version, is the definition SAP stored until an activation succeeds
        // (a failed read is said so, and the chain goes on; a credential
        // failure ends it).
        atStep('check', async () => {
          stored = await readStoredDefinition(
            () =>
              obj.readMetadata(
                { tableTypeName },
                {
                  version: 'inactive',
                  withLongPolling: true,
                  analyse: analyseException,
                },
              ),
            'inactive',
            detail,
          );
          return withAdtHeaders(context, 'tableType.check', (headers) =>
            obj.check({ tableTypeName }, undefined, {
              headers,
              analyse: analyseException,
            }),
          );
        }),
      );

      if (!checked.ok || !shouldActivate) return checked;

      const activated = await carryCleanup(
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
      // Activated: the definition SAP stored is the active version's, read
      // once after the activation (a failed read is said so; a credential
      // failure ends the call).
      if (activated.ok) {
        stored = await readStoredDefinition(
          () =>
            obj.readMetadata(
              { tableTypeName },
              { version: 'active', analyse: analyseException },
            ),
          'active',
          detail,
        );
      }
      return activated;
    },
    project(detail, terseWrite),
  );
}
