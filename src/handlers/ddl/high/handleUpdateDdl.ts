/**
 * UpdateDdl Handler - Update existing CDS/Classic view DDL source
 *
 * Uses AdtClient.getDdl().{lock,check,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> (check, iff activating) -> update -> unlock ->
 * (activate). The pre-write check gates the write exactly as the
 * pre-migration handler did — only when `activate` is true. The
 * pre-migration handler's *post*-unlock check is gone: its own `catch`
 * never rethrew, so it could never have changed the answer.
 *
 * **The source goes through `options.sourceCode` for `update`,
 * `config.ddlSource` for `check`.** See `UpdateDdlLow` for `update`.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseCheck,
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
  name: 'UpdateDdl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: DDL source. Will be useful for updating or creating a DDL source. Update DDL source code of an existing CDS View or Classic View. Locks, updates, unlocks, and optionally activates. Use CreateDdl to create a new DDL source.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., ZOK_R_TEST_0002).',
      },
      ddl_source: { type: 'string', description: 'Complete DDL source code.' },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default: false.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['ddl_name', 'ddl_source'],
  },
} as const;

interface UpdateDdlArgs {
  ddl_name: string;
  ddl_source: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateDdl(
  context: HandlerContext,
  args: UpdateDdlArgs,
) {
  const { connection, logger } = context;

  if (!args.ddl_name || !args.ddl_source) {
    return return_error(
      new Error('Missing required parameters: ddl_name and ddl_source'),
    );
  }

  const ddlName = args.ddl_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateDdl', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getDdl(
        resultsFor(ddlDocuments),
      );

      const written = await withLock(
        () => obj.lock({ ddlName }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = () =>
            obj.update(
              { ddlName, transportRequest: args.transport_request },
              {
                sourceCode: args.ddl_source,
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
                    { ddlName, ddlSource: args.ddl_source },
                    'inactive',
                    { analyse: analyseCheck },
                  ),
                update,
              )
            : update();
        },
        (lockHandle) => obj.unlock({ ddlName }, lockHandle),
      );
      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ ddlName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
