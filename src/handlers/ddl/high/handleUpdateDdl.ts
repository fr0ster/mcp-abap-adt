/**
 * UpdateDdl Handler - Update existing CDS/Classic view DDL source
 *
 * Uses AdtClient.getDdl().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> update -> unlock -> (activate). The pre-write and
 * post-unlock syntax checks the pre-migration handler ran are gone: they
 * duplicated what `update`'s own `analyseException` already verdicts, and
 * dropping them matches this tool's documented contract ("Locks, updates,
 * unlocks, and optionally activates") and every low-tier sibling.
 *
 * **The source goes through `options.sourceCode`.** See `UpdateDdlLow`.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
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
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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
        (lockHandle) =>
          obj.update(
            { ddlName, transportRequest: args.transport_request },
            {
              sourceCode: args.ddl_source,
              lockHandle,
              analyse: analyseException,
            },
          ),
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
