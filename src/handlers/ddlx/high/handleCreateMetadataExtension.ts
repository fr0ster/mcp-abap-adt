import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateMetadataExtension Handler - ABAP Metadata Extension Creation via ADT API
 *
 * Uses AdtClient.getMetadataExtension().{create,lock,check,unlock,activate}
 * from @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: create -> lock+check+unlock (through `withLock`) -> (wait for
 * the write to be visible) -> (activate). `create` never takes a source
 * (the endpoint posts a metadata document only — see
 * `CreateMetadataExtensionLow`), so there is nothing to write inside the
 * lock; the lock's body is the syntax check the pre-migration handler ran
 * while holding it. The wait before `activate` is the pre-migration
 * handler's long-polling `read({withLongPolling: true})`, discarded for its
 * result but not for what it does — see `handleUpdateDomain.ts` (high) for
 * the live incident this guards against, documented in `documentPatch.ts`.
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
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP Metadata Extension (DDLX) in SAP system. Creates the metadata extension object in initial state.',
  inputSchema: createArguments('CreateMetadataExtension', {
    name: z.string().describe('Metadata Extension name'),
    description: z.string().optional().describe('Description'),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe('Transport request number, not a task'),
    activate: z
      .boolean()
      .optional()
      .describe('Activate after creation. Default: true'),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateMetadataExtensionArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreateMetadataExtension(
  context: HandlerContext,
  args: CreateMetadataExtensionArgs,
) {
  const { connection, logger } = context;

  if (!args.name || !args.package_name) {
    return return_error(new Error('Missing required parameters'));
  }

  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error);
  }

  const name = args.name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateMetadataExtension', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getMetadataExtension(
        resultsFor(metadataExtensionDocuments),
      );

      const created = await atStep('create', () =>
        withAdtHeaders(context, 'metadataExtension.create', (headers) =>
          obj.create(
            {
              name,
              description: args.description || name,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              masterLanguage: args.master_language,
            },
            { headers, analyse: analyseException },
          ),
        ),
      )();
      if (!created.ok) return created;

      const checked = await withLock(
        () => obj.lock({ name }, { analyse: analyseLock }),
        // `inactive` said out loud, now that the tools name their version:
        // this runs between the write and the activation, so the only version
        // that exists yet is the unsaved one. The endpoint does not fall back
        // — asking for `active` here answers `notProcessed`.
        atStep('check', () =>
          withAdtHeaders(context, 'metadataExtension.check', (headers) =>
            obj.check({ name }, 'inactive', {
              headers,
              analyse: analyseException,
            }),
          ),
        ),
        (lockHandle) =>
          obj.unlock({ name }, lockHandle, { analyse: analyseException }),
        { type: 'METADATA_EXTENSION', name: name },
      );
      if (!checked.ok) {
        return checked;
      }

      // Best-effort (a credential failure ends the call): wait for the write to be visible before activating.
      await obj
        .read({ name }, 'inactive', {
          withLongPolling: true,
          analyse: analyseException,
        })
        .catch(unlessCredentialFailure);

      if (!shouldActivate) {
        return checked;
      }

      return carryCleanup(
        checked,
        atStep('activate', () =>
          withAdtHeaders(context, 'metadataExtension.activate', (headers) =>
            obj.activate({ name }, { headers, analyse: analyseActivation }),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
