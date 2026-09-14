/**
 * ValidateObject Handler - Validate ABAP object name via ADT API
 *
 * A dispatcher, not an object family of its own: one branch runs per call,
 * over the same family clients every other `validate` handler in this
 * migration uses. Each branch carries its own `resultsFor(xDocuments)` and
 * `analyseValidation`, so a refusal ADT embeds in a 200 (the validation shape
 * every low-level ValidateX handler now reads) is read as a failure here too,
 * rather than folded into `admissible: true`.
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
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
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

  return answer(
    { tool: 'ValidateObjectLow', detail },
    () => {
      switch (normalizedType) {
        case 'program':
          return client.getProgram(resultsFor(programDocuments)).validate(
            {
              programName: objectName,
              packageName: package_name,
              description,
            },
            { analyse: analyseValidation },
          );
        case 'class':
          return client
            .getClass(resultsFor(classDocuments))
            .validate(
              { className: objectName, packageName: package_name, description },
              { analyse: analyseValidation },
            );
        case 'interface':
          return client.getInterface(resultsFor(interfaceDocuments)).validate(
            {
              interfaceName: objectName,
              packageName: package_name,
              description,
            },
            { analyse: analyseValidation },
          );
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .validate(
              { functionGroupName: objectName, description },
              { analyse: analyseValidation },
            );
        case 'table':
          return client
            .getTable(resultsFor(tableDocuments))
            .validate(
              { tableName: objectName, packageName: package_name, description },
              { analyse: analyseValidation },
            );
        case 'structure':
          return client.getStructure(resultsFor(structureDocuments)).validate(
            {
              structureName: objectName,
              packageName: package_name,
              description,
            },
            { analyse: analyseValidation },
          );
        case 'ddl':
          return client
            .getDdl(resultsFor(ddlDocuments))
            .validate(
              { ddlName: objectName, packageName: package_name, description },
              { analyse: analyseValidation },
            );
        case 'domain':
          return client.getDomain(resultsFor(domainDocuments)).validate(
            {
              domainName: objectName,
              packageName: package_name,
              description,
            },
            { analyse: analyseValidation },
          );
        case 'data_element':
          return client
            .getDataElement(resultsFor(dataElementDocuments))
            .validate(
              {
                dataElementName: objectName,
                packageName: package_name,
                description,
              },
              { analyse: analyseValidation },
            );
        case 'package':
          return client
            .getPackage(resultsFor(packageDocuments))
            .validate(
              { packageName: objectName, description },
              { analyse: analyseValidation },
            );
        case 'behavior_definition':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .validate(
              {
                name: objectName,
                packageName: package_name,
                description,
                rootEntity: root_entity,
                implementationType: normalizedImplementationType,
              },
              { analyse: analyseValidation },
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
                packageName: package_name as string,
                behaviorDefinition: behavior_definition || '',
                ...(description ? { description } : {}),
              },
              { analyse: analyseValidation },
            );
        case 'metadata_extension':
        case 'ddlx/ex':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .validate(
              { name: objectName, description, packageName: package_name },
              { analyse: analyseValidation },
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
