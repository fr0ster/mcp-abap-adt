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
 * On that fallback path the masking is real and **not fixed here** — surfaced
 * here, in the PR description and in the release notes, per issue #200. A
 * second, independent change since 18.x compounds it: `activateObjectsGroup`
 * now only starts an asynchronous run and answers the run id (`/activation/
 * runs`, 19.0.0's three-step flow — see `AdtUtils.activateObjectsGroup`'s own
 * doc comment) rather than the synchronous activation result the 18.x
 * wrapper polled for internally. This handler does not implement that
 * poll-and-fetch loop — `getActivationRun`/`getActivationResults` are not
 * exposed as tools — so the fallback path answers "a run was started",
 * never a verdict, whether or not SAP actually activated anything.
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
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { ourUtils, resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateObjectLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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
      ...DETAIL_PROPERTY,
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
const TYPE_TO_FAMILY: Record<string, ActivationFamily> = {
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

  const activationObjects = args.objects.map((obj) => ({
    type: obj.type,
    name: obj.name.toUpperCase(),
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
  // does not map to a family client. See the module doc comment — this path
  // keeps the masking issue #200 describes, and answers a run id rather than
  // an activation verdict (adt-clients 19's `activateObjectsGroup` only
  // starts the run).
  return answer(
    { tool: 'ActivateObjectLow', detail: 'terse' },
    () =>
      client
        .getUtils(ourUtils)
        .activateObjectsGroup(activationObjects, preaudit),
    (runId: string) => ({
      started: true,
      run_id: runId || null,
      objects_count: activationObjects.length,
      objects: activationObjects,
      message:
        `Activation run started for ${activationObjects.length} object(s). ` +
        'This path answers a run id, not an activation verdict — adt-clients 19 ' +
        'made group activation asynchronous, and a refusal embedded in a 200 is ' +
        'not caught here (activateObjectsGroup takes no analyse strategy; see ' +
        'issue #200). Prefer calling this tool one object at a time when the ' +
        "object's type is supported, which reads the real verdict.",
    }),
  );
}
