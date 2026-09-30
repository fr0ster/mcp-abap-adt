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
 * even a legacy alias. `update()`'s own doc comment is short ("Change the
 * binding's publication state — one POST to a job endpoint"); the doc
 * comment that actually settles what replaced the composite is further
 * down the same `.d.ts`, on `updateRequest` — the *private* method
 * `update()` calls internally, easy to miss because it sits well past
 * `lock`/`unlock`/`delete`/`activate`/`check`/`readTransport`, nowhere near
 * the public member it explains:
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
 * **One call does not mean no lock.** `AdtServiceBinding.lock()`'s own doc
 * comment: "Publishing is what editing a service binding is — it is not
 * edited any other way — so this is the lock a publication takes. Measured
 * from Eclipse (ADT 3.60.3), 2026-09-05: `_action=LOCK&accessMode=MODIFY`
 * on a stateful session before the job, and `_action=UNLOCK&lockHandle=…`
 * when the editor closes... The caller takes it, and the caller gives it
 * back. This member does not lock inside `update` on the caller's behalf."
 * `unlock()`'s own comment names the cost of skipping it: "Without it the
 * binding stays 'currently being edited': its own delete is refused with
 * `You are already editing`, and a `_action=LOCK` from anywhere else —
 * another session, another process, the same user — is answered `403
 * ExceptionResourceNoAccess`." So this handler takes the lock itself,
 * through `withLock` — the same combinator every other locked write in this
 * repository uses — releasing it on every path out of `update()`, refused
 * or not.
 *
 * **`service_name`/`service_version` reach the wire again, for V2.** They were
 * accepted and dropped while `IServiceBindingPublicationConfig` had nowhere to
 * put them — "the service name and version have nowhere to go", said
 * `types.d.ts` — and the consequence was that a V2 publication through this
 * handler could not succeed: the job answered `200` with `SEVERITY ERROR`,
 * naming an EMPTY service and version `0000`. adt-clients 23.0.5 takes them per
 * protocol, so this handler passes them for `odatav2` and not for `odatav4`,
 * where the body settles the target on its own. Both were measured on both
 * binding categories — UI and Web API behave the same on each protocol — so the
 * axis here is the protocol, not the variant.
 *
 * `service_version` keeps its `0001` default from the tool surface; `service_name`
 * is already required there, which is why nothing new is demanded of a caller.
 *
 * **`desired_publication_state: 'unchanged'` is refused before any client is
 * built.** `update()`'s own `updateRequest` throws synchronously for it
 * ("there is no request that changes nothing"); this handler surfaces the
 * same refusal as a normal `return_error` instead of a `client_threw`
 * adapter failure, and the type narrows `'published' | 'unpublished'` for
 * the call that follows.
 *
 * **An explicit timeout, well past the measured job.**
 * `IServiceBindingPublicationParams.timeout`'s own doc comment: "A
 * publication is the slowest request this library makes — ~135s measured on
 * a trial, and one unpublish still unsettled after eleven minutes — so the
 * 120s `SAP_TIMEOUT_LONG` default is a floor." Leaving `options.timeout`
 * unset would take that 120s floor into a job already measured to run
 * longer than it, on a system that this handler cannot know is the fast
 * case or the eleven-minute one. `PUBLISH_TIMEOUT_MS` below is the
 * documented worst case, not a guess at a middle ground.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  analysePublication,
} from '@mcp-abap-adt/adt-strategies';
import {
  SERVICE_BINDING_VARIANT_MAP,
  type ServiceBindingVariant,
} from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { analysePublicationLockAnswer } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';
import type { ServiceBindingResponseFormat } from './serviceBindingPayloadUtils';

/**
 * The documented worst case ("one unpublish still unsettled after eleven
 * minutes"), not the common one — a client-side timeout that fires while
 * the job is still genuinely running server-side is worse than a caller
 * waiting.
 */
export const PUBLISH_TIMEOUT_MS = 11 * 60 * 1000;

type DesiredPublicationStateInput = 'published' | 'unpublished' | 'unchanged';

export const TOOL_DEFINITION = {
  name: 'UpdateServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description: 'Update publication state of an existing ABAP service binding.',
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
          'Published service name, from the binding. Required: an OData V2 publication job resolves the service by name and version and refuses without them. Ignored for V4, where the request names its target on its own.',
      },
      service_version: {
        type: 'string',
        description:
          'Published service version. Default 0001. Used by an OData V2 publication job together with the service name; ignored for V4.',
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
    () => {
      const obj = createAdtClient(connection, logger).getServiceBinding(
        resultsFor(serviceDocuments),
      );
      return (async () => {
        // **`analysePublicationLockAnswer`.** The `403` on this LOCK
        // means an editing session holds the binding, and the publication job
        // needs no lock of ours — Eclipse posts it after its own LOCK's `403`.
        // The strategy turns that one refusal into a lock without a handle and
        // leaves every other refusal a refusal — including a `2xx` that names no
        // handle, which adt-strategies' own `analysePublicationLock` does not
        // catch: it is built on `analyseException`, so a login page on an expired
        // session is a `200` and therefore no failure to it, and the caller gets
        // the same empty handle as for the `403`. Composing `analyseLock` under
        // the forgiveness is what makes an empty handle here mean exactly one
        // thing. With plain `analyseLock` this handler refused the `403` instead,
        // and a binding anybody had open could not be published at all.
        const acquired = await obj.lock(
          { bindingName },
          { analyse: analysePublicationLockAnswer },
        );
        if (!acquired.ok) return acquired;

        const publish = (lockHandle: string) =>
          obj.update(
            // **V2 resolves the service by name and version; V4 does not.** The
            // job's body names the target by type (`SCGR`) and name, and for V2
            // that is not enough — without the two fields it answers `200` with
            // `SEVERITY ERROR`, naming an empty service and version `0000`.
            // Measured on all four variants (adt-clients 23.0.5 ERRATA, "A V2
            // publication job resolves the service by name and version").
            serviceType === 'odatav2'
              ? {
                  bindingName,
                  desiredPublicationState,
                  serviceType,
                  serviceName: args.service_name.trim().toUpperCase(),
                  serviceVersion: (args.service_version ?? '0001').trim(),
                }
              : { bindingName, desiredPublicationState, serviceType },
            // adt-clients 23 no longer reads SAP's publication refusal on its
            // own (MIGRATION-23 §3); `analysePublication` is that verdict.
            {
              lockHandle,
              timeout: PUBLISH_TIMEOUT_MS,
              analyse: analysePublication,
            },
          );

        // No handle, so there is nothing to give back: an UNLOCK without one
        // answers 200 and changes nothing. `withLock` exists to release what was
        // taken, and nothing was.
        const lockHandle = acquired.getResult().value;
        if (lockHandle === '') return publish('');

        return withLock(
          () => Promise.resolve(acquired),
          publish,
          (handle) =>
            obj.unlock({ bindingName }, handle, { analyse: analyseException }),
        );
      })();
    },
    project(detail, terseWrite),
  );
}
