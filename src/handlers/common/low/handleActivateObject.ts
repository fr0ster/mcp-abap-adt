/**
 * ActivateObject Handler - Universal ABAP Object Activation via ADT API
 *
 * **The one collision between this migration's rule and the library's
 * surface (task 13, spec 2026-09-12).** Every other write handler in this
 * migration hands its member an `analyse` strategy so a refusal ADT embeds in
 * a 200 — group activation's own masking family, already fixed once in this
 * repository (`project_adt_activation_masking.md`) — is read as a failure.
 * `AdtUtils.activateObjectsGroup` cannot take one: its signature is
 * `(objects, preauditRequested?)`, with no `options` parameter at all, so
 * there is nowhere to inject a strategy. Giving it the `<E extends
 * IAdtError>` shape every other member here has is tracked as issue #200 in
 * `@mcp-abap-adt/adt-clients` — not something this migration can decide.
 *
 * **The decision: call the per-object `activate()` instead, for the case
 * that matters.** Every family's own `activate(config, options)` DOES accept
 * `analyse` (`AdtDomain`, `AdtClass` via `AdtClassMemberBase`, `AdtInterface`,
 * `AdtFunctionGroup`, `AdtTable`, `AdtStructure`, `AdtDdl`, `AdtDataElement`,
 * `AdtBehaviorDefinition`, `AdtMetadataExtension` all do). A single-object
 * call — the common case for this tool, matching what every other low-level
 * `ActivateXLow` handler already does one object at a time — is served by
 * mapping the object's ADT type code to that family and calling its
 * `activate()` directly, carrying `analyseActivation`. No masking on that
 * path: `answer()` reads the strategy's verdict, not the HTTP status.
 *
 * **What per-object activation does NOT serve, and why the group member
 * stays for it.** Two cases fall back to `activateObjectsGroup`:
 *
 *   1. More than one object in the call. Activating N objects one at a time
 *      cannot reproduce group activation's cross-object dependency handling
 *      (a BDEF that only activates cleanly together with the DDLS it is
 *      "FOR BEHAVIOR OF") — this is a real semantic gap, not only a mapping
 *      gap, so looping per-object is not equivalent here.
 *   2. A single object whose ADT type code this dispatcher does not map to a
 *      family client (`FUGR/FF` needs a group name this array does not carry;
 *      `service_binding`/`service_definition`/other families this generic
 *      tool has never dispatched).
 *
 * **What that fallback path answers, and why a run id is not a lesser
 * answer.** ADT is asynchronous here, and always has been: `POST
 * /activation/runs` answering means the request was accepted — the object
 * references were valid and a run was queued — not that activation
 * finished. Waiting inside one call for a `finished`/`error` status was the
 * 18.x wrapper's own invention (an internal poll loop); ADT never promised
 * it, so this is not a capability this migration lost. The fallback answers
 * what the protocol actually said: accepted or not, by whether a run id
 * came back, and it points a caller at `GetInactiveObjects` — the tool this
 * server already exposes for exactly this question — rather than inventing
 * a verdict this call does not have. An object still listed there after the
 * run is one that did not activate.
 *
 * What genuinely IS a gap, and stays one on this path: `activateObjectsGroup`
 * cannot judge a refusal the way every per-object `activate()` above does.
 * It takes no `options` parameter at all, so there is nowhere to inject
 * `analyse`, and a refusal ADT embeds in this path's answer is not read as a
 * failure — the same masking family this repository has already fixed
 * twice, left open here. That is issue #200 in `@mcp-abap-adt/adt-clients`,
 * surfaced here, in the PR description and in the release notes — not fixed
 * by this migration.
 */

import {
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  ddlDocuments,
  domainDocuments,
  functionGroupDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  programDocuments,
  structureDocuments,
  tableDocuments,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type {
  AdtUtilityCode,
  IAdtError,
  IAdtGroupActivationReference,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../../../lib/adtClientContract';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  ACTIVATION_CODES,
  ACTIVATION_NAMES,
  COMPACT_ACTIVATE,
  codesWithNames,
  MAIN_TYPE_SENTENCE,
  NAME_CASE_SENTENCE,
  type ProjectionVariant,
  SINGLE_ACTIVATION,
  SINGLE_ACTIVATION_NAMES,
  SINGLE_ACTIVATION_ROUTES,
  type TYPE_NAMES,
  type TypeName,
} from '../../../lib/adtProjections';
import {
  acceptedCodeOf,
  acceptedOf,
  activationParentDescription,
  type GroupObject,
  namesItsParent,
  notAccepted,
} from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import {
  createAdtClient,
  createOnPremAdtClient,
  variantOf,
} from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type ActivationRunOutcome,
  type ActivationRunSource,
  awaitActivationRun,
  isRefusal,
} from '../../../lib/strategies/activationRun';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import { failedWith, succeededWith } from '../../../lib/strategies/sequence';
import { withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';

/**
 * The APIs whose own `activate()` this dispatcher reaches directly: those of
 * `SINGLE_ACTIVATION_ROUTES`, which names each code and kind a single object
 * is activated by (the tables' `activate`). Every other code
 * goes to group activation; see the module doc comment.
 */
type SingleActivationApi =
  (typeof SINGLE_ACTIVATION_ROUTES)[keyof typeof SINGLE_ACTIVATION_ROUTES]['api'];

/**
 * What `preaudit` does on `variant`, for both activation tools: the codes and
 * kinds a single object is activated by through its own type's activation
 * there (`SINGLE_ACTIVATION`), and the names standing for those codes
 * (`SINGLE_ACTIVATION_NAMES`).
 */
export function preauditDescription(variant: ProjectionVariant): string {
  return `Request pre-audit before activation. Default: true. Sent as preauditRequested when the call takes group activation: more than one object, or one object of any other type. These codes and kinds (either case) and names (lower case) take single-object activation: ${[...SINGLE_ACTIVATION[variant], ...SINGLE_ACTIVATION_NAMES[variant]].join(', ')}. So does a main type or a search name standing for one of these codes. Their family's activate() always sends preauditRequested=true.`;
}

/**
 * What `objects[].type` takes on `variant`: a code a group activation takes
 * (`ACTIVATION_CODES`), or a name standing for one (`ACTIVATION_NAMES`); one
 * object alone also by the kind its own activation serves
 * (`SINGLE_ACTIVATION`).
 */
export function activationTypeDescription(variant: ProjectionVariant): string {
  const named = new Set<string>(ACTIVATION_NAMES[variant]);
  const kinds = SINGLE_ACTIVATION[variant].filter(
    (name) => !name.includes('/') && !named.has(name),
  );
  return `Object type: an ADT type code (either case), or a name standing for one (in brackets after it): ${codesWithNames(ACTIVATION_CODES[variant], ACTIVATION_NAMES[variant])}. One object alone may also be named ${kinds.join(', ')}. ${NAME_CASE_SENTENCE} ${MAIN_TYPE_SENTENCE}`;
}

export const TOOL_DEFINITION = {
  name: 'ActivateObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description:
      '[low-level] Activate one or multiple ABAP repository objects. Works with any object type; URI is auto-generated from name and type.',
    inputSchema: activateObjectSchema(variant),
  })),
} as const;

/** ActivateObjectLow's input on `variant`. */
function activateObjectSchema(variant: ProjectionVariant) {
  return {
    type: 'object',
    properties: {
      objects: {
        type: 'array',
        description:
          "Array of objects to activate. Each object must have 'name' and 'type'. URI is optional.",
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Object name in uppercase' },
            type: {
              type: 'string',
              description: activationTypeDescription(variant),
            },
            uri: { type: 'string', description: 'Optional ADT URI' },
            parentName: {
              type: 'string',
              description: activationParentDescription(variant),
            },
          },
          required: ['name', 'type'],
        },
      },
      preaudit: {
        type: 'boolean',
        description: preauditDescription(variant),
      },
      detail: {
        type: 'string',
        enum: ['terse', 'full', 'raw'],
        default: 'terse',
        description:
          'How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it). Ignored on the group-activation fallback (more than one object, or a type this tool cannot map to a single family): that path answers a bare run id with no document behind it, so there is nothing for "full" or "raw" to add.',
      },
    },
    required: ['objects'],
  } as const;
}

/**
 * One object of the tool's argument, as the caller sent it: `type` is text
 * from outside the type system, checked once by {@link activationPlan}.
 */
export interface ActivationObject {
  name: string;
  type: string;
  uri?: string;
  parentName?: string;
}

/**
 * A group activation's references, typed by the variant they are sent on
 * (`IAdtGroupActivationReference<V>`): the codes a group activation takes
 * there, each naming its parent where the tables give its code one.
 */
export type GroupActivation =
  | {
      readonly variant: 'onprem';
      readonly references: IAdtGroupActivationReference<'onprem'>[];
    }
  | {
      readonly variant: 'cloud';
      readonly references: IAdtGroupActivationReference<'cloud'>[];
    };

/**
 * What an activation does, decided once at the tool's boundary: one object
 * activated through its own API's `activate()`, or a group activation of
 * references the tables type.
 */
export type ActivationPlan =
  | {
      readonly single: {
        readonly api: SingleActivationApi;
        readonly name: string;
      };
    }
  | { readonly group: GroupActivation };

/**
 * `text` as the boundary of `objects[].type` reads it on `variant`: a code
 * of the group activation, a name standing for one or a main type of one
 * code is that code ({@link acceptedCodeOf}, the case rule included: `VIEW`
 * is `VIEW/DV`, `view` is `DDLS/DF`), read once here, so one object of a
 * name is routed exactly as one object of its code (every single-object
 * code is a group activation code, `adtBoundary.typecheck.ts`). Any other
 * text — a kind of a single-object activation, or what is refused — stays
 * as sent.
 */
function activationTextOf(text: string, variant: ProjectionVariant): string {
  return (
    acceptedCodeOf(
      text,
      ACTIVATION_CODES[variant],
      ACTIVATION_NAMES[variant],
    ) ?? text
  );
}

/**
 * The boundary of `objects[].type` on `variant`: one object of a code or
 * kind of `SINGLE_ACTIVATION`, or of a name standing for such a code, is
 * activated through its API; every other call is a group activation, each
 * type a code of `ACTIVATION_CODES` or a name of `ACTIVATION_NAMES` standing
 * for one. A main type one code has stands for
 * that code ({@link activationTextOf}). Anything else is refused in fixed
 * words naming what the argument takes there — for a main type two codes
 * share, those codes — and nothing is sent.
 */
export function activationPlan(
  sent: readonly ActivationObject[],
  variant: ProjectionVariant,
): ActivationPlan | string {
  const objects = sent.map((obj) => ({
    ...obj,
    type: activationTextOf(obj.type, variant),
  }));
  const [only] = objects;
  if (objects.length === 1 && only !== undefined) {
    const single = acceptedOf(only.type, SINGLE_ACTIVATION[variant]);
    if (single !== undefined) {
      return {
        single: { api: SINGLE_ACTIVATION_ROUTES[single].api, name: only.name },
      };
    }
  }
  if (variant === 'onprem') {
    const references = groupReferences(
      objects,
      ACTIVATION_CODES.onprem,
      ACTIVATION_NAMES.onprem,
      variant,
    );
    return typeof references === 'string'
      ? references
      : { group: { variant, references } };
  }
  const references = groupReferences(
    objects,
    ACTIVATION_CODES.cloud,
    ACTIVATION_NAMES.cloud,
    variant,
  );
  return typeof references === 'string'
    ? references
    : { group: { variant, references } };
}

/**
 * The group activation's references of `objects` (their types already read
 * by {@link activationTextOf}): each type a code of `codes` or a name of
 * `names` standing for one, and each object of a code the tables give a
 * parent naming it in `parentName`. Anything else is refused in fixed words
 * and nothing is sent.
 */
function groupReferences<C extends AdtUtilityCode, N extends TypeName>(
  objects: readonly ActivationObject[],
  codes: readonly C[],
  names: readonly N[],
  variant: ProjectionVariant,
) {
  const references: GroupObject<C | (typeof TYPE_NAMES)[N]>[] = [];
  for (const obj of objects) {
    const type = acceptedCodeOf(obj.type, codes, names);
    if (type === undefined) {
      return notAccepted(
        'objects[].type',
        obj.type,
        [
          ...codes,
          ...names,
          ...(objects.length === 1 ? SINGLE_ACTIVATION[variant] : []),
        ],
        codes,
      );
    }
    references.push({ ...obj, type });
  }
  const addressed = references.filter(namesItsParent);
  const unaddressed = references.find((obj) => !namesItsParent(obj));
  return unaddressed === undefined
    ? addressed
    : `objects[].parentName is required for ${unaddressed.name} (${unaddressed.type}): the name of the object it belongs to; nothing was sent`;
}

/**
 * A group activation's first request, `POST /activation/runs`, on the
 * variant its references are typed for: the on-premise client for an
 * on-premise group (it may hold codes only `ADT_TYPES_ONPREM` activates), the
 * client of what both modern tables serve for a cloud one.
 */
function startGroupActivation(
  context: HandlerContext,
  group: GroupActivation,
  preaudit: boolean,
) {
  const { connection, logger } = context;
  return withAdtHeaders(context, 'utils.activateObjectsGroup', (headers) =>
    group.variant === 'onprem'
      ? createOnPremAdtClient(connection, logger)
          .getUtils(ourUtils)
          .activateObjectsGroup(group.references, preaudit, {
            headers,
            analyse: analyseException,
          })
      : createAdtClient(connection, logger)
          .getUtils(ourUtils)
          .activateObjectsGroup(group.references, preaudit, {
            headers,
            analyse: analyseException,
          }),
  );
}

interface ActivateObjectArgs {
  objects: ActivationObject[];
  preaudit?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

function activateFamily(
  context: HandlerContext,
  client: IServerAdtClient,
  api: SingleActivationApi,
  name: string,
) {
  switch (api) {
    case 'class':
      return withAdtHeaders(context, 'class.activate', (headers) =>
        client
          .getClass(resultsFor(classDocuments))
          .activate(
            { className: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'program':
      // A program is activated on premise only (`ADT_TYPES_ONPREM`).
      return withAdtHeaders(context, 'program.activate', (headers) =>
        createOnPremAdtClient(context.connection, context.logger)
          .getProgram(resultsFor(programDocuments))
          .activate(
            { programName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'interface':
      return withAdtHeaders(context, 'interface.activate', (headers) =>
        client
          .getInterface(resultsFor(interfaceDocuments))
          .activate(
            { interfaceName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'functionGroup':
      return withAdtHeaders(context, 'functionGroup.activate', (headers) =>
        client
          .getFunctionGroup(resultsFor(functionGroupDocuments))
          .activate(
            { functionGroupName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'table':
      return withAdtHeaders(context, 'table.activate', (headers) =>
        client
          .getTable(resultsFor(tableDocuments))
          .activate(
            { tableName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'structure':
      return withAdtHeaders(context, 'structure.activate', (headers) =>
        client
          .getStructure(resultsFor(structureDocuments))
          .activate(
            { structureName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'ddl':
      return withAdtHeaders(context, 'ddl.activate', (headers) =>
        client
          .getDdl(resultsFor(ddlDocuments))
          .activate({ ddlName: name }, { headers, analyse: analyseActivation }),
      );
    case 'domain':
      return withAdtHeaders(context, 'domain.activate', (headers) =>
        client
          .getDomain(resultsFor(domainDocuments))
          .activate(
            { domainName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'dataElement':
      return withAdtHeaders(context, 'dataElement.activate', (headers) =>
        client
          .getDataElement(resultsFor(dataElementDocuments))
          .activate(
            { dataElementName: name },
            { headers, analyse: analyseActivation },
          ),
      );
    case 'behaviorDefinition':
      return withAdtHeaders(context, 'behaviorDefinition.activate', (headers) =>
        client
          .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
          .activate({ name }, { headers, analyse: analyseActivation }),
      );
    case 'metadataExtension':
      return withAdtHeaders(context, 'metadataExtension.activate', (headers) =>
        client
          .getMetadataExtension(resultsFor(metadataExtensionDocuments))
          .activate({ name }, { headers, analyse: analyseActivation }),
      );
  }
}

/** One object activated through its own API's `activate()`: its verdict. */
function activateSingle(
  context: HandlerContext,
  single: { readonly api: SingleActivationApi; readonly name: string },
  detail: 'terse' | 'full' | 'raw',
) {
  const client = createAdtClient(context.connection, context.logger);
  return answer(
    { tool: 'ActivateObjectLow', detail },
    () => activateFamily(context, client, single.api, single.name),
    project(detail, terseActivation),
  );
}

export async function handleActivateObject(
  context: HandlerContext,
  params: ActivateObjectArgs,
) {
  const { connection, logger } = context;
  const args = params;

  if (
    !args.objects ||
    !Array.isArray(args.objects) ||
    args.objects.length === 0
  ) {
    return return_error(
      new Error(
        'Missing required parameter: objects (must be non-empty array)',
      ),
    );
  }

  const preaudit = args.preaudit !== false; // default true
  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);

  // **`uri` is carried, not dropped — and today nothing downstream reads
  // it.** The schema above has advertised it since this handler existed,
  // "Optional ADT URI", and this mapping kept only the type and the name, so
  // a caller who supplied one was answered as though they had not. Accepting
  // a field and discarding it is wrong whoever reads it next, which is the
  // whole reason to carry it.
  //
  // What it does NOT do is fix addressing, and saying so here saves the next
  // person the two measurements it took: `activateObjectsGroup` builds the
  // reference with `buildObjectUri(name, type, parentName)` and never looks
  // at `uri`; and for `fugr/ff` that builder addresses the module under
  // `parentName` and throws without it (adt-clients 25), never reading a
  // `GROUP|MODULE` name as the group. A function module is therefore
  // activated by naming its group in `parentName`, not by supplying an
  // address.
  //
  // `parentName` travels by the same contract — "Owning object, where the
  // reference is to a part of one" — and is read for the types whose builder
  // uses it.
  //
  // Neither is invented when absent: an object the client can address from a
  // name is unaffected, which is every case that worked before.
  const activationObjects = args.objects.map((obj) => ({
    type: obj.type,
    name: obj.name.toUpperCase(),
    ...(obj.uri ? { uri: obj.uri } : {}),
    ...(obj.parentName ? { parentName: obj.parentName } : {}),
  }));

  const plan = activationPlan(activationObjects, variantOf(connection));
  if (typeof plan === 'string') return return_error(new Error(plan));

  logger?.info(`Starting activation of ${activationObjects.length} object(s)`);

  if ('single' in plan) return activateSingle(context, plan.single, detail);

  // Fallback: multiple objects, or a single object of a type this dispatcher
  // does not map to a family client. See the module doc comment: ADT's
  // answer here is acceptance, not completion, and this path is honest about
  // that rather than inventing a verdict it does not have.
  // **Three requests, because only the third says what happened.** The POST
  // answers `202` with the run id in `Location` and a body that carries
  // nothing, so a handler that stopped there had acceptance and no verdict —
  // and the empty body parses to zero messages, which reads exactly like "no
  // errors". `getActivationRun` then says whether the run is still going, and
  // `getActivationResults` carries the `chkl:messages` the single-object
  // endpoint answers inline. See `lib/strategies/activationRun.ts`.
  const utils = client.getUtils(ourUtils);
  return answer(
    { tool: 'ActivateObjectLow', detail: 'terse' },
    async () => {
      const started = await startGroupActivation(context, plan.group, preaudit);
      if (!started.ok) return started as never;
      const runId = started.getResult().value;
      const outcome = await awaitActivationRun(
        utils as unknown as ActivationRunSource,
        runId,
        analyseException,
      );
      // Reading the run failed: the method's error as it is, with its step.
      if (outcome.failure !== undefined)
        return failedWith<ActivationRunOutcome>(outcome.failure);
      return succeededWith(outcome);
    },
    (outcome: ActivationRunOutcome) => {
      // A run id is the only evidence that anything was accepted —
      // `utilActivationRunId` answers `''` when no `Location` header carried
      // one. `accepted` says so rather than being hardcoded true.
      const accepted = outcome.runId !== '';
      const refusals = outcome.messages.filter(isRefusal);
      // `activated` is a verdict now, and `null` only where there genuinely is
      // none: a run that has not settled within the bounded wait. A settled run
      // with no error-severity message activated what it was given; the errata
      // is explicit that only such a message is a failure, and that a run with
      // nothing to do says nothing at all.
      const activated = !outcome.settled
        ? null
        : refusals.length === 0 && outcome.status !== 'failed';
      return {
        accepted,
        run_id: accepted ? outcome.runId : null,
        run_status: outcome.status || null,
        activated,
        messages: outcome.messages,
        objects_count: activationObjects.length,
        objects: activationObjects,
        message: !accepted
          ? `activateObjectsGroup did not accept the request for ${activationObjects.length} ` +
            'object(s) — no run id came back, so there is no evidence a run was ' +
            'queued at all.'
          : activated === null
            ? `Activation run ${outcome.runId} was accepted for ${activationObjects.length} object(s) and ` +
              `has not settled yet (runs:status "${outcome.status || 'unknown'}"). Its results carry no ` +
              'verdict while it runs; ask again, or read GetInactiveObjects — an object still ' +
              'listed there did not activate.'
            : activated
              ? `Activation run ${outcome.runId} finished for ${activationObjects.length} object(s) with no ` +
                'error-severity message. GetInactiveObjects is still the answer to "is it active ' +
                'now": an object can stay listed for scope rather than for failure — activating a ' +
                "function group clears the regenerated include, not the group's own entry."
              : `Activation run ${outcome.runId} finished and refused ${refusals.length} of ` +
                `${activationObjects.length} object(s): ` +
                refusals
                  .map(
                    (m) =>
                      `${m.objectName ? `${m.objectName}: ` : ''}${m.text}`,
                  )
                  .join('; '),
      };
    },
  );
}

/**
 * The compact names `HandlerActivate` activates from `object_type` alone on
 * the variant declared for `connection` (`COMPACT_ACTIVATE`): what its
 * refusal lists.
 */
export function compactActivatableTypes(connection: object): readonly string[] {
  return COMPACT_ACTIVATE[variantOf(connection)];
}

/** The step a run start's failure arose at. */
const START_ACTIVATION_RUN = 'start activation run';

/** A run start SAP answered with no run id: the fixed words. */
export const RUN_START_WITHOUT_ID =
  'SAP answered the activation run start without a run id: no Location header carried one, so the run cannot be read.';

/**
 * The activation in one request (compact `HandlerActivate`; spec §4.6, one
 * ADT request per tool call).
 *
 * One object of a type the per-object activation maps is that activation —
 * the same request and answer as `handleActivateObject`. Every other call is
 * the one `POST /activation/runs`, answered `{ run_id }`: the run was
 * accepted and has no verdict yet. Its status and its messages are separate
 * reads by that id (`handleGetActivationStatus`,
 * `handleGetActivationResults`); waiting between them is the caller's.
 */
export async function handleActivateObjectOnce(
  context: HandlerContext,
  params: ActivateObjectArgs,
) {
  const { connection, logger } = context;
  const args = params;
  if (
    !args.objects ||
    !Array.isArray(args.objects) ||
    args.objects.length === 0
  ) {
    return return_error(
      new Error(
        'Missing required parameter: objects (must be non-empty array)',
      ),
    );
  }
  const activationObjects = args.objects.map((obj) => ({
    type: obj.type,
    name: obj.name.toUpperCase(),
    ...(obj.uri ? { uri: obj.uri } : {}),
    ...(obj.parentName ? { parentName: obj.parentName } : {}),
  }));
  const plan = activationPlan(activationObjects, variantOf(connection));
  if (typeof plan === 'string') return return_error(new Error(plan));
  return activatePlanOnce(context, plan, args.preaudit);
}

/**
 * An activation decided at its tool's boundary ({@link ActivationPlan}), in
 * one request: one object through its own API's `activate()`, answered with
 * its verdict; a group as one `POST /activation/runs`, answered `{ run_id }`.
 */
export async function activatePlanOnce(
  context: HandlerContext,
  plan: ActivationPlan,
  preauditRequested?: boolean,
) {
  if ('single' in plan) return activateSingle(context, plan.single, 'terse');
  const preaudit = preauditRequested !== false;
  return answer(
    { tool: 'HandlerActivate', detail: 'terse' },
    async () => {
      const started = await startGroupActivation(context, plan.group, preaudit);
      if (!started.ok) {
        return failedWith<string>(
          withStep(started.getError(), START_ACTIVATION_RUN),
        );
      }
      // A run is read by its id alone, and the id travels only in `Location`:
      // an answer without one started nothing the caller can read.
      const runId = started.getResult().value;
      if (runId === '') {
        return failedWith<string>(
          withStep(
            { message: RUN_START_WITHOUT_ID, origin: 'refusal' } as IAdtError,
            START_ACTIVATION_RUN,
          ),
        );
      }
      return succeededWith(runId);
    },
    (runId: string) => ({ run_id: runId }),
  );
}
