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
 * the live incident this guards against, documented in `xmlPatch.ts`.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
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
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: MetadataExtension. Will be useful for creating metadata extension. Create a new ABAP Metadata Extension (DDLX) in SAP system. Creates the metadata extension object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name',
      },
      description: {
        type: 'string',
        description: 'Description',
      },
      package_name: {
        type: 'string',
        description: 'Package name',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after creation. Default: true',
      },
      master_language: {
        type: 'string',
        description:
          'Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name', 'package_name'],
  },
} as const;

interface CreateMetadataExtensionArgs {
  name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  activate?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
    return return_error(error as Error);
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

      const created = await obj.create(
        {
          name,
          description: args.description || name,
          packageName: args.package_name,
          transportRequest: args.transport_request,
          masterLanguage: args.master_language,
        },
        { analyse: analyseException },
      );
      if (!created.ok) return created;

      const checked = await withLock(
        () => obj.lock({ name }),
        () => obj.check({ name }, undefined, { analyse: analyseCheck }),
        (lockHandle) => obj.unlock({ name }, lockHandle),
      );
      if (!checked.ok) {
        return checked as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      // Best-effort: wait for the write to be visible before activating.
      await obj
        .read({ name }, 'inactive', {
          withLongPolling: true,
          analyse: analyseException,
        })
        .catch(() => undefined);

      if (!shouldActivate) {
        return checked as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ name }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
