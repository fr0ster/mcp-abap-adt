/**
 * UpdateInterface Handler - Update existing ABAP Interface source code
 *
 * Uses AdtClient.getInterface().{lock,check,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> (check, iff activating) -> update -> unlock ->
 * (activate). The pre-write check gates the write exactly as the
 * pre-migration handler did — only when `activate` is true. The
 * pre-migration handler's *post*-unlock check is gone: its own `catch`
 * never rethrew, so it could never have changed the answer.
 *
 * **The source goes in `options` for `update`, `config` for `check`.** See
 * `UpdateInterfaceLow` for `update` — the shipped `AdtInterface.update()`
 * reads `options?.sourceCode` only; `AdtInterface.check()` reads
 * `config.sourceCode`.
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
import { sequence } from '../../../lib/strategies/sequence';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateInterface',
  available_in: ['onprem', 'cloud'] as const,
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
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
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
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const update = () =>
            obj.update(
              { interfaceName, transportRequest: args.transport_request },
              {
                sourceCode: args.source_code,
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
                    { interfaceName, sourceCode: args.source_code },
                    'inactive',
                    { analyse: analyseException },
                  ),
                update,
              )
            : update();
        },
        (lockHandle) => obj.unlock({ interfaceName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return carryCleanup(written, () =>
        obj.activate({ interfaceName }, { analyse: analyseActivation }),
      );
    },
    project(detail, terseWrite),
  );
}
