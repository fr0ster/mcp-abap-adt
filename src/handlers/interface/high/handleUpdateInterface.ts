/**
 * UpdateInterface Handler - Update existing ABAP Interface source code
 *
 * Uses AdtClient.getInterface().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> update -> unlock -> (activate). The pre-write and
 * post-unlock syntax checks the pre-migration handler ran are gone: they
 * duplicated what `update`'s own `analyseException` already verdicts, and
 * dropping them matches this tool's documented contract ("Locks, updates,
 * unlocks, and optionally activates") and every low-tier sibling.
 *
 * **The source goes in `options`, not `config`.** See `UpdateInterfaceLow` —
 * the shipped `AdtInterface.update()` reads `options?.sourceCode` only.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'UpdateInterface',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update, Create. Subject: Interface. Will be useful for updating or creating interface. Update source code of an existing ABAP interface. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description:
          'Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system.',
      },
      source_code: {
        type: 'string',
        description:
          'Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate interface after update. Default: true.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['interface_name', 'source_code'],
  },
} as const;

interface UpdateInterfaceArgs {
  interface_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateInterface(
  context: HandlerContext,
  args: UpdateInterfaceArgs,
) {
  const { connection, logger } = context;

  if (!args.interface_name || !args.source_code) {
    return return_error(
      new Error('interface_name and source_code are required'),
    );
  }

  const interfaceName = args.interface_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateInterface', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getInterface(
        resultsFor(interfaceDocuments),
      );

      const written = await withLock(
        () => obj.lock({ interfaceName }),
        (lockHandle) =>
          obj.update(
            { interfaceName, transportRequest: args.transport_request },
            {
              sourceCode: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) => obj.unlock({ interfaceName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ interfaceName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
