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
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import type { IObjectReference } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate one or multiple ABAP repository objects. Works with any object type; URI is auto-generated from name and type.',
  inputSchema: {
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
              description:
                "Object type code (e.g., 'CLAS/OC', 'PROG/P', 'DDLS/DF')",
            },
            uri: { type: 'string', description: 'Optional ADT URI' },
          },
          required: ['name', 'type'],
        },
      },
      preaudit: {
        type: 'boolean',
        description:
          'Request pre-audit before activation. Default: true. Honored only when the call falls back to group activation (more than one object, or a type this tool cannot map to a single family) — the per-object activate() this tool prefers for a single object has no preaudit parameter at all.',
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
  },
} as const;

interface ActivationObject extends IObjectReference {
  uri?: string;
}

interface ActivateObjectArgs {
  objects: ActivationObject[];
  preaudit?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

/** The families whose own `activate()` this dispatcher can reach directly. */
type ActivationFamily =
  | 'class'
  | 'program'
  | 'interface'
  | 'function_group'
  | 'table'
  | 'structure'
  | 'ddl'
  | 'domain'
  | 'data_element'
  | 'behavior_definition'
  | 'metadata_extension';

/**
 * ADT type codes (and this codebase's own friendly names, accepted
 * elsewhere in `common/low`) mapped to the family that serves them. Anything
 * not named here — `FUGR/FF` included — falls back to group activation; see
 * the module doc comment.
 */
export const TYPE_TO_FAMILY: Record<string, ActivationFamily> = {
  'clas/oc': 'class',
  class: 'class',
  'prog/p': 'program',
  program: 'program',
  'intf/oi': 'interface',
  interface: 'interface',
  'fugr/f': 'function_group',
  function_group: 'function_group',
  'tabl/dt': 'table',
  table: 'table',
  'ttyp/st': 'structure',
  structure: 'structure',
  'ddls/df': 'ddl',
  ddl: 'ddl',
  'doma/dm': 'domain',
  domain: 'domain',
  'dtel/de': 'data_element',
  data_element: 'data_element',
  'bdef/bd': 'behavior_definition',
  'bdef/bdo': 'behavior_definition',
  behavior_definition: 'behavior_definition',
  'ddlx/ex': 'metadata_extension',
  metadata_extension: 'metadata_extension',
};

function familyFor(typeCode: string): ActivationFamily | undefined {
  return TYPE_TO_FAMILY[typeCode.toLowerCase()];
}

function activateFamily(
  client: ReturnType<typeof createAdtClient>,
  family: ActivationFamily,
  name: string,
) {
  switch (family) {
    case 'class':
      return client
        .getClass(resultsFor(classDocuments))
        .activate({ className: name }, { analyse: analyseActivation });
    case 'program':
      return client
        .getProgram(resultsFor(programDocuments))
        .activate({ programName: name }, { analyse: analyseActivation });
    case 'interface':
      return client
        .getInterface(resultsFor(interfaceDocuments))
        .activate({ interfaceName: name }, { analyse: analyseActivation });
    case 'function_group':
      return client
        .getFunctionGroup(resultsFor(functionGroupDocuments))
        .activate({ functionGroupName: name }, { analyse: analyseActivation });
    case 'table':
      return client
        .getTable(resultsFor(tableDocuments))
        .activate({ tableName: name }, { analyse: analyseActivation });
    case 'structure':
      return client
        .getStructure(resultsFor(structureDocuments))
        .activate({ structureName: name }, { analyse: analyseActivation });
    case 'ddl':
      return client
        .getDdl(resultsFor(ddlDocuments))
        .activate({ ddlName: name }, { analyse: analyseActivation });
    case 'domain':
      return client
        .getDomain(resultsFor(domainDocuments))
        .activate({ domainName: name }, { analyse: analyseActivation });
    case 'data_element':
      return client
        .getDataElement(resultsFor(dataElementDocuments))
        .activate({ dataElementName: name }, { analyse: analyseActivation });
    case 'behavior_definition':
      return client
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        .activate({ name }, { analyse: analyseActivation });
    case 'metadata_extension':
      return client
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .activate({ name }, { analyse: analyseActivation });
  }
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
  // at `uri`; and for `fugr/ff` that builder ignores `parentName` as well,
  // requiring the group inside the name — `GROUP|MODULE` — and throwing
  // otherwise. A function module is therefore activated by naming it that
  // way, not by supplying an address.
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

  logger?.info(`Starting activation of ${activationObjects.length} object(s)`);

  const family =
    activationObjects.length === 1
      ? familyFor(activationObjects[0].type)
      : undefined;

  if (family !== undefined) {
    const objectName = activationObjects[0].name;
    return answer(
      { tool: 'ActivateObjectLow', detail },
      () => activateFamily(client, family, objectName),
      project(detail, terseActivation),
    );
  }

  // Fallback: multiple objects, or a single object of a type this dispatcher
  // does not map to a family client. See the module doc comment: ADT's
  // answer here is acceptance, not completion, and this path is honest about
  // that rather than inventing a verdict it does not have.
  return answer(
    { tool: 'ActivateObjectLow', detail: 'terse' },
    () =>
      client
        .getUtils(ourUtils)
        .activateObjectsGroup(activationObjects, preaudit),
    (runId: string) => {
      // A run id is the only evidence this path has that anything was
      // accepted — `activationRunId` answers `''` when no `Location` header
      // carried one (see its own doc comment in adt-clients). `accepted`
      // must say so rather than being hardcoded true: a caller scanning
      // field names, not the prose, would otherwise read this as success in
      // the one case where the reading found no evidence of acceptance.
      const accepted = runId !== '';
      return {
        accepted,
        run_id: accepted ? runId : null,
        // Explicitly null, not omitted: this call never carries a verdict —
        // acceptance is not completion — and a missing field reads
        // differently from a field that says so.
        activated: null,
        objects_count: activationObjects.length,
        objects: activationObjects,
        message: accepted
          ? `Activation run ${runId} accepted for ${activationObjects.length} object(s). ` +
            'ADT confirms acceptance here, not completion — call GetInactiveObjects ' +
            'afterwards; an object still listed there did not activate. Right after ' +
            'acceptance the run may still be in progress, so an immediate check can ' +
            'still show an object as inactive that goes on to activate a moment ' +
            'later. Separately, a refusal embedded in this accept response is not ' +
            'read as a failure on this path (activateObjectsGroup takes no analyse ' +
            'strategy on modern or legacy systems; see issue #200, tracked for the ' +
            'legacy contract specifically in issue #207).'
          : `activateObjectsGroup did not accept the request for ${activationObjects.length} ` +
            'object(s) — no run id came back, so this handler has no evidence a run ' +
            'was queued at all. Prefer calling this tool one object at a time when ' +
            "the type is supported, which reads a real verdict from the object's " +
            'own activate().',
      };
    },
  );
}
