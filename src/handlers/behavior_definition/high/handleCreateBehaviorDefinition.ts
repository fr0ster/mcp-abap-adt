import * as z from 'zod';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateBehaviorDefinition Handler - ABAP Behavior Definition Creation via ADT API
 *
 * Uses AdtClient.getBehaviorDefinition().{create,lock,check,unlock,activate}
 * from @mcp-abap-adt/adt-clients 19.
 *
 * Workflow: create -> lock+check+unlock (through `withLock`) -> (wait for
 * the write to be visible) -> (activate). `create` takes every field this
 * tool accepts (no separate body write), so the lock's body is the syntax
 * check the pre-migration handler ran while holding it. The wait before
 * `activate` is the pre-migration handler's long-polling
 * `read({withLongPolling: true})`, discarded for its result but not for
 * what it does — see `handleUpdateDomain.ts` (high) for the live incident
 * this guards against, documented in `xmlPatch.ts`.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type {
  BehaviorDefinitionImplementationType,
  IAdtError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
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
  name: 'CreateBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP Behavior Definition (BDEF) in SAP system. Creates the behavior definition object in initial state.',
  inputSchema: z.object({
    name: z
      .string()
      .describe('Behavior Definition name (usually same as Root Entity name)'),
    description: z.string().optional().describe('Description'),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe('Transport request number, not a task'),
    root_entity: z.string().describe('Root Entity name (CDS View name)'),
    implementation_type: z
      .enum(['Managed', 'Unmanaged', 'Abstract', 'Projection'])
      .describe(
        "Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'",
      ),
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

interface CreateBehaviorDefinitionArgs {
  name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  root_entity: string;
  implementation_type: BehaviorDefinitionImplementationType;
  activate?: boolean;
  master_language?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateBehaviorDefinition(
  context: HandlerContext,
  args: CreateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;

  if (
    !args.name ||
    !args.package_name ||
    !args.root_entity ||
    !args.implementation_type
  ) {
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
    { tool: 'CreateBehaviorDefinition', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getBehaviorDefinition(
        resultsFor(behaviorDefinitionDocuments),
      );

      const created = await atStep('create', () =>
        withAdtHeaders(context, 'behaviorDefinition.create', (headers) =>
          obj.create(
            {
              name,
              description: args.description || name,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              rootEntity: args.root_entity,
              implementationType: args.implementation_type,
              masterLanguage: args.master_language,
            },
            { headers, analyse: analyseException },
          ),
        ),
      )();
      if (!created.ok) return created;

      const checked = await withLock(
        () => obj.lock({ name }, { analyse: analyseLock }),
        atStep('check', () =>
          withAdtHeaders(context, 'behaviorDefinition.check', (headers) =>
            obj.check({ name }, undefined, {
              headers,
              analyse: analyseException,
            }),
          ),
        ),
        (lockHandle) =>
          obj.unlock({ name }, lockHandle, { analyse: analyseException }),
        { type: 'BEHAVIOR_DEFINITION', name: name },
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
          withAdtHeaders(context, 'behaviorDefinition.activate', (headers) =>
            obj.activate({ name }, { headers, analyse: analyseActivation }),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
