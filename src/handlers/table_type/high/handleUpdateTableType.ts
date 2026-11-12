import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateTableType Handler - Update an Existing ABAP Table Type
 *
 * As `UpdateDomain`, end to end, through `withLock` — the lock is held for
 * the read-modify-write-check in its body and released on every path out (a
 * refused read, a refused write, a refused check, a thrown patch all still
 * unlock).
 *
 * Workflow: lock -> (read, patch, write, check) -> unlock -> (wait for the
 * write to be visible) -> (activate unless `activate` is false). The check
 * runs inside the lock, as the domain's does; a refusal there stops the
 * answer exactly as a refused write would. The wait is the long-polling
 * `readMetadata({withLongPolling: true})` (see `handleUpdateDomain.ts` and
 * `documentPatch.ts`); its document, the inactive version, is the definition SAP
 * stored, answered beside the result; after a successful activation one read
 * of the active version answers it instead (`tableTypeStored.ts`).
 *
 * Only the properties the caller gave are patched into the document read
 * under the lock; every other one keeps SAP's value. No schema default but
 * `activate`'s, for the reason `handleCreateTableType.ts` gives. No
 * `package_name`: `UpdateDomain`'s fed only a transport check that checks
 * nothing, and the write never reads it.
 */

import {
  patchTableTypeDocument,
  tableTypeDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { tableTypeChanges } from '../../../lib/strategies/documentChanges';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import {
  readStoredDefinition,
  type StoredDefinitionAnswer,
} from '../../../lib/strategies/tableTypeStored';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';
import {
  type AccessType,
  type KeyDefinition,
  type KeyKind,
  type RowTypeKind,
  TABLE_TYPE_DEFINITION_PROPERTIES,
} from './handleCreateTableType';

export const TOOL_DEFINITION = {
  name: 'UpdateTableType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Changes the definition of the ABAP table type named by table_type_name: locks it, writes the given properties (description, row type, access type, primary key) into the document it holds, checks it, unlocks, and activates it when activate is true (the default). Every property left out keeps SAP's value. Returns SAP's answer to each step and the definition SAP stored, with the version it was read at (stored_version): the active version, read after a successful activation; with activate false or a refused activation, the inactive version, read after the unlock. The write is checked under the lock, before that read: a refused check is answered alone. A definition whose read failed is answered with SAP's answer to that read.",
  inputSchema: z.object({
    table_type_name: z
      .string()
      .describe('Table type name. The table type must already exist.'),
    description: z.string().optional().describe('New table type description.'),
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
      .describe('Activate the table type after the update (default: true).'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface UpdateTableTypeArgs {
  table_type_name?: string;
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

export async function handleUpdateTableType(
  context: HandlerContext,
  args: UpdateTableTypeArgs,
) {
  const { connection, logger } = context;

  if (!args.table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }

  const tableTypeName = args.table_type_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);
  // What the wait after the unlock read of the stored definition.
  let stored: StoredDefinitionAnswer | undefined;

  return answer(
    // The definition SAP stored rides along a success and a failure after
    // the wait alike; a chain that ended before the wait has none.
    { tool: 'UpdateTableType', detail, beside: () => stored },
    async () => {
      const obj = createAdtClient(connection, logger).getTableType(
        resultsFor(tableTypeDocuments),
      );

      const written = await withLock(
        () => obj.lock({ tableTypeName }, { analyse: analyseLock }),
        (lockHandle) =>
          sequence(
            atStep('read metadata', () =>
              obj.readMetadata(
                { tableTypeName },
                { version: 'workingArea', analyse: analyseException },
              ),
            ),
            async (current) =>
              patchedDocument(
                patchTableTypeDocument(
                  current.raw,
                  tableTypeChanges({
                    description: args.description,
                    row_type_kind: args.row_type_kind,
                    row_type_name: args.row_type_name,
                    data_type: args.data_type,
                    length: args.length,
                    decimals: args.decimals,
                    access_type: args.access_type,
                    key_definition: args.key_definition,
                    key_kind: args.key_kind,
                  }),
                ),
                `table type ${tableTypeName}`,
              ),
            atStep('update metadata', (document) =>
              withAdtHeaders(context, 'tableType.updateMetadata', (headers) =>
                obj.updateMetadata(
                  {
                    tableTypeName,
                    transportRequest: args.transport_request,
                  },
                  {
                    headers,
                    source: document,
                    lockHandle,
                    analyse: analyseException,
                  },
                ),
              ),
            ),
            atStep('check', () =>
              withAdtHeaders(context, 'tableType.check', (headers) =>
                obj.check({ tableTypeName }, undefined, {
                  headers,
                  analyse: analyseException,
                }),
              ),
            ),
          ),
        (lockHandle) =>
          obj.unlock({ tableTypeName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'TABLE_TYPE', name: tableTypeName },
      );

      if (!written.ok) return written;

      // Wait for the write to be visible before activating, as
      // `UpdateDomain` does; its document, the inactive version, is the
      // definition SAP stored until an activation succeeds (a failed read is
      // said so, and the call goes on; a credential failure ends it).
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

      if (!shouldActivate) return written;

      const activated = await carryCleanup(
        written,
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
