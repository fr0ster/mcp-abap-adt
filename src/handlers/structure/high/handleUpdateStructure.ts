/**
 * UpdateStructure Handler - Update Existing ABAP Structure DDL Source
 *
 * Uses AdtClient.getStructure().{lock,check,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> (check, iff activating) -> update -> unlock ->
 * (activate). The pre-write check gates the write exactly as the
 * pre-migration handler did — only when `activate` is true. Note:
 * `AdtStructure.check()`'s shipped `runTableCheckRun`/`checkStructure` call
 * does forward `config.ddlCode` to the wire request — unlike `AdtTable`'s,
 * whose check hardcodes no source (see `UpdateTable`) — so this check does
 * validate the unsaved source. The pre-migration handler's *post*-unlock
 * check is gone: its own `catch` never rethrew, so it could never have
 * changed the answer.
 *
 * **The source goes through `options.sourceCode` for `update`,
 * `config.ddlCode` for `check`.** See `UpdateStructureLow` for `update`.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: Structure. Will be useful for updating or creating structure. Update DDL source code of an existing ABAP structure. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description:
          'Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.',
      },
      ddl_code: {
        type: 'string',
        description:
          "Complete DDL source code for structure. Example: '@EndUserText.label : \\'My Structure\\' @AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : abap.clnt not null; id : abap.char(10); name : abap.char(255); }'",
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate structure after source update. Default: true.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['structure_name', 'ddl_code'],
  },
} as const;

interface UpdateStructureArgs {
  structure_name: string;
  ddl_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateStructure(
  context: HandlerContext,
  args: UpdateStructureArgs,
) {
  const { connection, logger } = context;

  if (!args.structure_name || !args.ddl_code) {
    return return_error(new Error('structure_name and ddl_code are required'));
  }

  const structureName = args.structure_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateStructure', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getStructure(
        resultsFor(structureDocuments),
      );

      const written = await withLock(
        () => obj.lock({ structureName }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = () =>
            obj.update(
              { structureName, transportRequest: args.transport_request },
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
                  obj.check(
                    { structureName, ddlCode: args.ddl_code },
                    'inactive',
                    { analyse: analyseException },
                  ),
                update,
              )
            : update();
        },
        (lockHandle) => obj.unlock({ structureName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ structureName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
