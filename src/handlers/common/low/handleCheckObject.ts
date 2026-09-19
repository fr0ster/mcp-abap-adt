/**
 * CheckObject Handler - Syntax check for ABAP objects via ADT API.
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level CheckX handler in this migration uses. Each branch carries its
 * own `resultsFor(xDocuments)` and `analyseCheck`.
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
import { analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: 'Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)',
      },
      object_type: {
        type: 'string',
        description: 'Object type',
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
          'behavior_definition',
          'metadata_extension',
        ],
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' or 'inactive' (default active)",
        enum: ['active', 'inactive'],
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

interface CheckObjectArgs {
  object_name: string;
  object_type: string;
  version?: string;
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
  'behavior_definition',
  'metadata_extension',
];

export async function handleCheckObject(
  context: HandlerContext,
  args: CheckObjectArgs,
) {
  const { connection, logger } = context;
  const {
    object_name,
    object_type,
    version = 'active',
    session_id,
    session_state,
  } = args as CheckObjectArgs;

  if (!object_name || !object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }

  const objectType = object_type.toLowerCase();
  if (!VALID_TYPES.includes(objectType)) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      ),
    );
  }

  const checkVersion = ['active', 'inactive'].includes(version.toLowerCase())
    ? (version.toLowerCase() as 'active' | 'inactive')
    : 'active';

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const objectName = object_name.toUpperCase();
  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'CheckObjectLow', detail },
    () => {
      switch (objectType) {
        case 'class':
          return client
            .getClass(resultsFor(classDocuments))
            .check({ className: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'program':
          return client
            .getProgram(resultsFor(programDocuments))
            .check({ programName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'interface':
          return client
            .getInterface(resultsFor(interfaceDocuments))
            .check({ interfaceName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .check({ functionGroupName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'table':
          return client
            .getTable(resultsFor(tableDocuments))
            .check({ tableName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'structure':
          return client
            .getStructure(resultsFor(structureDocuments))
            .check({ structureName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'ddl':
          return client
            .getDdl(resultsFor(ddlDocuments))
            .check({ ddlName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'domain':
          return client
            .getDomain(resultsFor(domainDocuments))
            .check({ domainName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'data_element':
          return client
            .getDataElement(resultsFor(dataElementDocuments))
            .check({ dataElementName: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'behavior_definition':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .check({ name: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        case 'metadata_extension':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .check({ name: objectName }, checkVersion, {
              analyse: analyseCheck,
            });
        default:
          // Unreachable: objectType was already checked against VALID_TYPES.
          throw new Error(`Unsupported object_type: ${object_type}`);
      }
    },
    project(detail, terseCheck),
  );
}
