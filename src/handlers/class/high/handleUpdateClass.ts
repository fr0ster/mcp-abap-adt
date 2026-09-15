/**
 * UpdateClass Handler - Update existing ABAP class source code (optional activation)
 *
 * Uses AdtClient.getClass().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — the lock is held for the
 * whole write, and released on every path out (a refused update, a thrown
 * projection, a refused unlock all still unlock).
 *
 * Workflow: lock -> update -> unlock -> (activate). The pre-write and
 * post-unlock syntax checks the pre-migration handler ran are gone: they
 * duplicated what `update`'s own `analyseException` already verdicts, and the
 * pre-write one silently swallowed its own "already checked" case. Dropping
 * them matches this tool's documented contract ("Locks, updates, unlocks, and
 * optionally activates") and every low-tier sibling in this cluster.
 *
 * **The source goes in `options`, not `config`.** See `UpdateClassLow` — the
 * shipped `AdtClass.update()` reads `options?.sourceCode` only.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'UpdateClass',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update, Create. Subject: Class. Will be useful for updating or creating class. Update source code of an existing ABAP class. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_TEST_CLASS_001).',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP class source code.',
      },
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
    required: ['class_name', 'source_code'],
  },
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateClass(
  context: HandlerContext,
  args: UpdateClassArgs,
) {
  const { connection, logger } = context;

  if (!args.class_name || !args.source_code) {
    return return_error(
      new Error('Missing required parameters: class_name and source_code'),
    );
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateClass', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getClass(
        resultsFor(classDocuments),
      );

      const written = await withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            {
              sourceCode: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) => obj.unlock({ className }, lockHandle),
      );
      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ className }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
