import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateInclude Handler - Write the Source of an Existing ABAP Include
 *
 * As `UpdateProgram`, through `withLock` — held for the whole write, released
 * on every path out: lock -> write -> unlock -> (activate). The include type
 * lists no check, so there is none. The client is the on-premise one, so a
 * connection declared otherwise is refused `variant_not_served` before
 * anything is sent.
 */

import { includeDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateInclude',
  available_in: ['onprem'] as const,
  description:
    "Writes source_code as the whole source of the ABAP include named by include_name: locks it, writes, unlocks, and activates when activate is true. Returns SAP's answer to the write (and to the activation).",
  inputSchema: z.object({
    include_name: z
      .string()
      .describe('Include name. The include must already exist.'),
    source_code: z.string().describe('Complete ABAP source of the include.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    activate: z
      .boolean()
      .optional()
      .describe('Activate the include after the write. Default: false.'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface UpdateIncludeArgs {
  include_name?: string;
  source_code?: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateInclude(
  context: HandlerContext,
  args: UpdateIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }
  if (!args.source_code) {
    return return_error(new Error('source_code is required'));
  }

  const includeName = args.include_name.toUpperCase();
  const source = args.source_code;
  const shouldActivate = args.activate === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateInclude', detail },
    async () => {
      const obj = createOnPremAdtClient(connection, logger).getInclude(
        resultsFor(includeDocuments),
      );

      const written = await withLock(
        () => obj.lock({ includeName }, { analyse: analyseLock }),
        (lockHandle) =>
          atStep('update', () =>
            withAdtHeaders(context, 'include.update', (headers) =>
              obj.update(
                { includeName, transportRequest: args.transport_request },
                {
                  headers,
                  source,
                  lockHandle,
                  analyse: analyseException,
                },
              ),
            ),
          )(),
        (lockHandle) =>
          obj.unlock({ includeName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'INCLUDE', name: includeName },
      );

      if (!written.ok || !shouldActivate) return written;

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'include.activate', (headers) =>
            obj.activate(
              { includeName },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
