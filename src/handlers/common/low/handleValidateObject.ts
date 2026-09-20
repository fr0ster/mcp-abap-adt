/**
 * ValidateObject Handler - Validate ABAP object name via ADT API
 *
 * A dispatcher, not an object family of its own: one branch runs per call,
 * over the same family clients every other `validate` handler in this
 * migration uses. Each branch carries its own `resultsFor(xDocuments)` and
 * `analyseException`.
 *
 * **A name that is not admissible is an answer, not a failure.** Two families
 * of validation answer differently — class, domain and table refuse a taken
 * name with HTTP 400 and an `exc:exception`, while DDL and function groups
 * answer 200 with `SEVERITY=ERROR` — and only the first is a failed call.
 * `analyseException` draws exactly that line. For a while these handlers
 * carried `analyseValidation`, which refuses on the body verdict too, so
 * asking whether a name was free and hearing "no" came back as an error;
 * the pre-migration handlers answered `success: result.valid` with the
 * reason beside it, and the creates that call `validate` first ignored its
 * verdict entirely. `terseValidation` carries it now, as `admissible`.
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
  packageDocuments,
  programDocuments,
  structureDocuments,
  tableDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP object name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Object name to validate (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE)',
      },
      object_type: {
        type: 'string',
        description:
          "Object type: 'class', 'program', 'interface', 'function_group', 'table', 'structure', 'ddl', 'domain', 'data_element', 'package', 'behavior_definition', 'behavior_implementation', 'metadata_extension'",
        enum: [
          'class',
          'program',
          'interface',
          'function_group',
          'table',
          'structure',
          'ddl',
          'domain',
          'data_element',
          'package',
          'behavior_definition',
          'behavior_implementation',
          'metadata_extension',
        ],
      },
      behavior_definition: {
        type: 'string',
        description:
          'Optional behavior definition name (required for behavior_implementation validation)',
      },
      root_entity: {
        type: 'string',
        description:
          'Root entity name (required for behavior_definition validation)',
      },
      implementation_type: {
        type: 'string',
        description:
          "Implementation type: 'Managed', 'Unmanaged', or 'External' (required for behavior_definition validation)",
      },
      package_name: {
        type: 'string',
        description: 'Optional package name for validation',
      },
      description: {
        type: 'string',
        description: 'Optional description for validation',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface ValidateObjectArgs {
  object_name: string;
  object_type: string;
  package_name?: string;
  description?: string;
  behavior_definition?: string;
  root_entity?: string;
  implementation_type?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

const VALID_TYPES = [
  'class',
  'program',
  'interface',
  'function_group',
  'table',
  'structure',
  'ddl',
  'domain',
  'data_element',
  'package',
  'behavior_definition',
  'behavior_implementation',
  'metadata_extension',
  'ddlx/ex',
];

type ImplementationType = 'Managed' | 'Unmanaged' | 'Abstract' | 'Projection';
const VALID_IMPLEMENTATION_TYPES: ImplementationType[] = [
  'Managed',
  'Unmanaged',
  'Abstract',
  'Projection',
];

/**
 * Main handler for ValidateObject MCP tool
 */
export async function handleValidateObject(
  context: HandlerContext,
  args: ValidateObjectArgs,
) {
  const { connection, logger } = context;
  const {
    object_name,
    object_type,
    package_name,
    description,
    behavior_definition,
    root_entity,
    implementation_type,
    session_id,
    session_state,
  } = args as ValidateObjectArgs;

  if (!object_name || !object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }

  const normalizedType = object_type.toLowerCase();
  if (!VALID_TYPES.includes(normalizedType)) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      ),
    );
  }

  // Family-specific required-argument checks. These stay ahead of the client
  // call, exactly where they lived before this migration: `validate()`'s
  // signature does not itself enforce them, so a request missing them would
  // otherwise reach the wire only to be refused there.
  let normalizedImplementationType: ImplementationType | undefined;
  if (normalizedType === 'behavior_definition') {
    if (!package_name || !description || !root_entity || !implementation_type) {
      return return_error(
        new Error(
          'Behavior definition validation requires packageName, description, rootEntity, and implementationType parameters',
        ),
      );
    }
    normalizedImplementationType = (implementation_type
      .charAt(0)
      .toUpperCase() +
      implementation_type.slice(1).toLowerCase()) as ImplementationType;
    if (!VALID_IMPLEMENTATION_TYPES.includes(normalizedImplementationType)) {
      return return_error(
        new Error(
          `Invalid implementationType. Must be one of: ${VALID_IMPLEMENTATION_TYPES.join(', ')}`,
        ),
      );
    }
  }
  if (normalizedType === 'behavior_implementation' && !package_name) {
    return return_error(
      new Error(
        'Behavior implementation validation requires packageName parameter',
      ),
    );
  }
  if (
    (normalizedType === 'metadata_extension' || normalizedType === 'ddlx/ex') &&
    (!package_name || !description)
  ) {
    return return_error(
      new Error(
        'Metadata extension validation requires description and packageName parameters',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const objectName = object_name.toUpperCase();
  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);
  // An empty string collapses to absent, the same as every field the old
  // handler guarded with `|| undefined` — an empty `package_name` or
  // `description` reaching the wire is not the same request as the field
  // being left out, and the old handler never sent the former.
  const packageName = package_name || undefined;
  const normalizedDescription = description || undefined;

  return answer(
    { tool: 'ValidateObjectLow', detail },
    () => {
      switch (normalizedType) {
        case 'program':
          return client.getProgram(resultsFor(programDocuments)).validate(
            {
              programName: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'class':
          return client.getClass(resultsFor(classDocuments)).validate(
            {
              className: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'interface':
          return client.getInterface(resultsFor(interfaceDocuments)).validate(
            {
              interfaceName: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .validate(
              {
                functionGroupName: objectName,
                description: normalizedDescription,
              },
              { analyse: analyseException },
            );
        case 'table':
          return client.getTable(resultsFor(tableDocuments)).validate(
            {
              tableName: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'structure':
          return client.getStructure(resultsFor(structureDocuments)).validate(
            {
              structureName: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'ddl':
          return client.getDdl(resultsFor(ddlDocuments)).validate(
            {
              ddlName: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'domain':
          return client.getDomain(resultsFor(domainDocuments)).validate(
            {
              domainName: objectName,
              packageName,
              description: normalizedDescription,
            },
            { analyse: analyseException },
          );
        case 'data_element':
          return client
            .getDataElement(resultsFor(dataElementDocuments))
            .validate(
              {
                dataElementName: objectName,
                packageName,
                description: normalizedDescription,
              },
              { analyse: analyseException },
            );
        case 'package':
          return client
            .getPackage(resultsFor(packageDocuments))
            .validate(
              { packageName: objectName, description: normalizedDescription },
              { analyse: analyseException },
            );
        case 'behavior_definition':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .validate(
              {
                name: objectName,
                packageName,
                description: normalizedDescription,
                rootEntity: root_entity,
                implementationType: normalizedImplementationType,
              },
              { analyse: analyseException },
            );
        case 'behavior_implementation':
          // A behavior implementation IS a class (`BDEF/BDO`'s implementation
          // is an ABAP class carrying `FOR BEHAVIOR OF`), so it reads back
          // through `classDocuments` — see adt-clients' own
          // `behaviorImplementation/types.ts`.
          return client
            .getBehaviorImplementation(resultsFor(classDocuments))
            .validate(
              {
                className: objectName,
                packageName: packageName as string,
                behaviorDefinition: behavior_definition || '',
                ...(normalizedDescription
                  ? { description: normalizedDescription }
                  : {}),
              },
              { analyse: analyseException },
            );
        case 'metadata_extension':
        case 'ddlx/ex':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .validate(
              {
                name: objectName,
                description: normalizedDescription,
                packageName,
              },
              { analyse: analyseException },
            );
        default:
          // Unreachable: normalizedType was already checked against
          // VALID_TYPES above.
          throw new Error(`Unsupported object_type: ${object_type}`);
      }
    },
    project(detail, terseValidation),
  );
}
