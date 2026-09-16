/**
 * UpdateTable Handler - Update Existing ABAP Table DDL Source
 *
 * Uses AdtClient.getTable().{lock,check,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> (check, iff activating) -> update -> unlock ->
 * (activate). The pre-write check gates the write exactly as the
 * pre-migration handler did — only when `activate` is true. **Unlike
 * `AdtStructure.check()`, the shipped `AdtTable.check()` never forwards
 * `config.ddlCode` to the wire call** (`runTableCheckRun(..., undefined,
 * version)` hardcodes no source) — so this check validates the
 * already-saved inactive version, not the unsaved `ddl_code`, the same
 * limitation the pre-migration handler's identical call already had. The
 * pre-migration handler's *post*-unlock check is gone: its own `catch`
 * never rethrew, so it could never have changed the answer.
 *
 * **The source goes through `options.sourceCode` for `update`.** See
 * `UpdateTableLow`.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck, analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: Table. Will be useful for updating or creating table. Update DDL source code of an existing ABAP table. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description:
          'Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist.',
      },
      ddl_code: {
        type: 'string',
        description:
          "Complete DDL source code for table. Example: '@EndUserText.label : \\'My Table\\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'",
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate table after source update. Default: true.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_name', 'ddl_code'],
  },
} as const;

interface UpdateTableArgs {
  table_name: string;
  ddl_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateTable(
  context: HandlerContext,
  args: UpdateTableArgs,
) {
  const { connection, logger } = context;

  if (!args.table_name || !args.ddl_code) {
    return return_error(new Error('table_name and ddl_code are required'));
  }

  const tableName = args.table_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateTable', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getTable(
        resultsFor(tableDocuments),
      );

      const written = await withLock(
        () => obj.lock({ tableName }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = () =>
            obj.update(
              { tableName, transportRequest: args.transport_request },
              {
                sourceCode: args.ddl_code,
                lockHandle,
                analyse: analyseException,
              },
            );
          // A conditional phase of the sequence, not a hand-rolled
          // short-circuit: see UpdateClass for the reasoning.
          return shouldActivate
            ? sequence(
                () =>
                  obj.check({ tableName, ddlCode: args.ddl_code }, 'inactive', {
                    analyse: analyseCheck,
                  }),
                update,
              )
            : update();
        },
        (lockHandle) => obj.unlock({ tableName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ tableName }, { analyse: ourActivation });
    },
    project(detail, terseWrite),
  );
}
