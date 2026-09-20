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
 * this guards against, documented in `xmlPatch.ts`.
 *
 * **The source goes in `options`, not `config`.** See
 * `UpdateMetadataExtensionLow` — the shipped `AdtMetadataExtension.update()`
 * reads `options?.sourceCode` only.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
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
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: MetadataExtension. Will be useful for updating or creating metadata extension. Update source code of an existing ABAP Metadata Extension (DDLX). Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name',
      },
      source_code: {
        type: 'string',
        description: 'New source code',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. If not provided, will attempt to lock internally.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default: true',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name', 'source_code'],
  },
} as const;

interface UpdateMetadataExtensionArgs {
  name: string;
  source_code: string;
  lock_handle?: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

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

  // `lock_handle` given by the caller is honoured, not re-acquired — the same
  // shape the pre-migration handler had. Without one, this locks and unlocks
  // itself through `withLock`.
  return answer(
    { tool: 'UpdateMetadataExtension', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getMetadataExtension(
        resultsFor(metadataExtensionDocuments),
      );

      const update = (lockHandle: string) =>
        obj.update(
          { name: ddlxName, transportRequest: args.transport_request },
          {
            sourceCode: args.source_code,
            lockHandle,
            analyse: analyseException,
          },
        );

      const written = args.lock_handle
        ? await update(args.lock_handle)
        : await withLock(
            () => obj.lock({ name: ddlxName }),
            update,
            (lockHandle) => obj.unlock({ name: ddlxName }, lockHandle),
          );

      if (!written.ok) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      // Best-effort: wait for the write to be visible before activating.
      await obj
        .read({ name: ddlxName }, 'inactive', {
          withLongPolling: true,
          analyse: analyseException,
        })
        .catch(() => undefined);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        await obj.activate({ name: ddlxName }, { analyse: analyseActivation }),
      );
    },
    project(detail, terseWrite),
  );
}
