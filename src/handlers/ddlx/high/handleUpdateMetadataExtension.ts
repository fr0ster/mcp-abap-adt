import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateMetadataExtension Handler - ABAP Metadata Extension Update via ADT API
 *
 * Uses AdtClient.getMetadataExtension().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> update -> unlock -> (wait for the write to be visible)
 * -> (activate). The wait is the pre-migration handler's long-polling
 * `read({withLongPolling: true})`, discarded for its result but not for
 * what it does — see `handleUpdateDomain.ts` (high) for the live incident
 * this guards against, documented in `documentPatch.ts`.
 *
 * **The source goes in `options`, not `config`.** See
 * `UpdateMetadataExtensionLow` — the shipped `AdtMetadataExtension.update()`
 * reads `options?.source` only.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer, unlessCredentialFailure } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';
import type { XmlRead } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'UpdateMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update source code of an existing ABAP Metadata Extension (DDLX). Locks, updates, unlocks, and optionally activates.',
  inputSchema: z.object({
    name: z.string().describe('Metadata Extension name'),
    source_code: z.string().describe('New source code'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number (required for transportable packages), not a task.',
      ),
    activate: z
      .boolean()
      .optional()
      .describe('Activate after update. Default: true'),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateMetadataExtensionArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateMetadataExtension(
  context: HandlerContext,
  args: UpdateMetadataExtensionArgs,
) {
  const { connection, logger } = context;

  if (!args.name || !args.source_code) {
    return return_error(new Error('Missing required parameters'));
  }

  const ddlxName = args.name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  // The handler locks, writes and unlocks itself through `withLock`: it takes
  // no lock_handle (on the full set no tool issues one).
  return answer(
    { tool: 'UpdateMetadataExtension', detail },
    async (): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getMetadataExtension(
        resultsFor(metadataExtensionDocuments),
      );

      const update = (lockHandle: string) =>
        withAdtHeaders(context, 'metadataExtension.update', (headers) =>
          obj.update(
            { name: ddlxName, transportRequest: args.transport_request },
            {
              headers,
              source: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        );

      const written = await withLock(
        () => obj.lock({ name: ddlxName }, { analyse: analyseLock }),
        atStep('update', update),
        (lockHandle) =>
          obj.unlock({ name: ddlxName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'METADATA_EXTENSION', name: ddlxName },
      );

      if (!written.ok) {
        return written;
      }

      // Best-effort (a credential failure ends the call): wait for the write to be visible before activating.
      await obj
        .read({ name: ddlxName }, 'inactive', {
          withLongPolling: true,
          analyse: analyseException,
        })
        .catch(unlessCredentialFailure);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'metadataExtension.activate', (headers) =>
            obj.activate(
              { name: ddlxName },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
