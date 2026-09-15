/**
 * UpdateServiceBinding Handler - Change an ABAP service binding's
 * publication state
 *
 * Uses AdtClient.getServiceBinding().update from @mcp-abap-adt/adt-clients 19.
 *
 * **`updateServiceBinding` is gone with no successor of that name, and the
 * guide's "Sequences are yours" table does not list it either.** Grepping
 * the shipped package (`dist/core/service/AdtService.js`, `dist/**\/*.d.ts`)
 * for `updateServiceBinding` finds nothing — no method, no re-export, not
 * even a legacy alias. `AdtServiceBinding.update()`'s own doc comment
 * settles what replaced it, in the compiled source rather than only the
 * `.d.ts`:
 *
 * > "This used to read the binding first. The read filled in the service
 * > name and version from the object's own document, short-circuited when
 * > the state was already the one asked for, and refused a transition ADT
 * > would have refused itself — four useful things, and one member issuing
 * > two requests... Three of the four went with the query string: the job
 * > is posted without `servicename` or `serviceversion`... The fourth — 'can
 * > it go from here to there?' — is the server's to answer, and it does: an
 * > invalid transition comes back as `SEVERITY` in the job's own document."
 *
 * `update()`'s body (`AdtService.js` line ~302) confirms this directly: one
 * `updateRequest` call, no second request before or after it, and its
 * default `analyse` is the exported `publicationRefusal` — read from the
 * job's own `<SEVERITY>`, not from HTTP status, and not overridden here
 * because it already is the tailored verdict this endpoint needs. The
 * removed composite is therefore **one call**, not a sequence:
 * `classifyServiceBinding` (a GET against `/businessservices/release`,
 * confirmed in the same file) is a different endpoint entirely — nothing in
 * `update()`'s implementation calls it, and nothing in this handler's
 * pre-migration behaviour ever touched a classification endpoint.
 *
 * **`service_name`/`service_version` stay on the tool surface but no longer
 * reach the wire.** `IServiceBindingPublicationConfig` doesn't carry them at
 * all — "the service name and version have nowhere to go" per
 * `types.d.ts`'s own comment — so they are validated as required (the tool
 * surface is frozen) and otherwise ignored, the same acceptance
 * `handleDeleteServiceBinding.ts` gives `response_format`.
 *
 * **`desired_publication_state: 'unchanged'` is refused before any client is
 * built.** `update()`'s own `updateRequest` throws synchronously for it
 * ("there is no request that changes nothing"); this handler surfaces the
 * same refusal as a normal `return_error` instead of a `client_threw`
 * adapter failure, and the type narrows `'published' | 'unpublished'` for
 * the call that follows.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import {
  SERVICE_BINDING_VARIANT_MAP,
  type ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import type { ServiceBindingResponseFormat } from './serviceBindingPayloadUtils';

type DesiredPublicationStateInput = 'published' | 'unpublished' | 'unchanged';

export const TOOL_DEFINITION = {
  name: 'UpdateServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: ServiceBinding. Will be useful for updating or creating service binding. Update publication state of an existing ABAP service binding.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name to update.',
      },
      desired_publication_state: {
        type: 'string',
        enum: ['published', 'unpublished', 'unchanged'],
        description: 'Target publication state.',
      },
      binding_variant: {
        type: 'string',
        enum: [
          'ODATA_V2_UI',
          'ODATA_V2_WEB_API',
          'ODATA_V4_UI',
          'ODATA_V4_WEB_API',
        ],
        description:
          'Service binding variant. Determines OData version for publish/unpublish routing.',
        default: 'ODATA_V4_UI',
      },
      service_name: {
        type: 'string',
        description:
          'Published service name. Accepted for backward compatibility; the publication job no longer carries it.',
      },
      service_version: {
        type: 'string',
        description:
          'Published service version. Accepted for backward compatibility; the publication job no longer carries it.',
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
        description:
          'Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.',
      },
      ...DETAIL_PROPERTY,
    },
    required: [
      'service_binding_name',
      'desired_publication_state',
      'binding_variant',
      'service_name',
    ],
  },
} as const;

interface UpdateServiceBindingArgs {
  service_binding_name: string;
  desired_publication_state: DesiredPublicationStateInput;
  binding_variant?: ServiceBindingVariant;
  service_name: string;
  service_version?: string;
  response_format?: ServiceBindingResponseFormat;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateServiceBinding(
  context: HandlerContext,
  args: UpdateServiceBindingArgs,
) {
  const { connection, logger } = context;

  if (!args?.service_binding_name) {
    return return_error(new Error('service_binding_name is required'));
  }
  if (!args?.desired_publication_state) {
    return return_error(new Error('desired_publication_state is required'));
  }
  if (!args?.binding_variant) {
    return return_error(new Error('binding_variant is required'));
  }
  if (!args?.service_name) {
    return return_error(new Error('service_name is required'));
  }
  if (args.desired_publication_state === 'unchanged') {
    return return_error(
      new Error(
        "Cannot update to 'unchanged': a service binding's update is its " +
          'publication, and there is no request that changes nothing. Omit the call instead.',
      ),
    );
  }

  const bindingName = args.service_binding_name.trim().toUpperCase();
  const bindingVariant: ServiceBindingVariant = args.binding_variant;
  const { serviceType } = SERVICE_BINDING_VARIANT_MAP[bindingVariant];
  const desiredPublicationState = args.desired_publication_state;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateServiceBinding', detail },
    () =>
      createAdtClient(connection, logger)
        .getServiceBinding(resultsFor(serviceDocuments))
        .update({
          bindingName,
          desiredPublicationState,
          serviceType,
        }),
    project(detail, terseWrite),
  );
}
