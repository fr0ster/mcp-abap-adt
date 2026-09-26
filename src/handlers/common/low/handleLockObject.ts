/**
 * LockObject Handler - Lock ABAP object for modification via ADT API
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level LockX handler in this migration uses.
 *
 * `lock()` takes `analyseLock` in every branch below, as every single-family
 * LockXLow handler does: a 2xx naming no handle is a refusal, with SAP's
 * answer beside it (`lib/strategies/lockAnswer.ts`). Its answer is the lock handle itself, and the projection
 * is the envelope the tool already returned: nothing about `lock` varies with
 * `detail`, so the parameter is not added to this tool's surface.
 */

import {
  behaviorDefinitionDocuments,
  classDocuments,
  dataElementDocuments,
  ddlDocuments,
  domainDocuments,
  functionGroupDocuments,
  functionModuleDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  packageDocuments,
  programDocuments,
  structureDocuments,
  tableDocuments,
} from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { generateSessionId } from '../../../lib/sessionUtils';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'LockObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Lock an ABAP object for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME',
      },
      object_type: {
        type: 'string',
        description: 'Object type',
        enum: [
          'class',
          'program',
          'interface',
          'function_group',
          'function_module',
          'table',
          'structure',
          'ddl',
          'domain',
          'data_element',
          'package',
          'behavior_definition',
          'metadata_extension',
        ],
      },
      super_package: {
        type: 'string',
        description: 'Super package (required for package locking)',
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
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface LockObjectArgs {
  object_name: string;
  object_type: string;
  super_package?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

const VALID_TYPES = [
  'class',
  'program',
  'interface',
  'function_group',
  'function_module',
  'table',
  'structure',
  'ddl',
  'domain',
  'data_element',
  'package',
  'behavior_definition',
  'metadata_extension',
];

export async function handleLockObject(
  context: HandlerContext,
  args: LockObjectArgs,
) {
  const { connection, logger } = context;
  const { object_name, object_type, super_package, session_id, session_state } =
    args as LockObjectArgs;

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

  // Two request-shape checks that stay ahead of the client call, exactly
  // where they lived before this migration: `lock()`'s config does not
  // itself enforce either.
  let functionGroupName: string | undefined;
  let functionModuleName: string | undefined;
  if (objectType === 'function_module') {
    if (!object_name.toUpperCase().includes('|')) {
      return return_error(
        new Error('Function module name must be in format GROUP|FM_NAME'),
      );
    }
    [functionGroupName, functionModuleName] = object_name
      .toUpperCase()
      .split('|');
  }
  if (objectType === 'package' && !super_package) {
    return return_error(
      new Error('super_package is required for package locking.'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const desiredSessionId = session_id || generateSessionId();
  const objectName = object_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'LockObjectLow', detail: 'terse' },
    () => {
      switch (objectType) {
        case 'class':
          return client
            .getClass(resultsFor(classDocuments))
            .lock({ className: objectName }, { analyse: analyseLock });
        case 'program':
          return client
            .getProgram(resultsFor(programDocuments))
            .lock({ programName: objectName }, { analyse: analyseLock });
        case 'interface':
          return client
            .getInterface(resultsFor(interfaceDocuments))
            .lock({ interfaceName: objectName }, { analyse: analyseLock });
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .lock({ functionGroupName: objectName }, { analyse: analyseLock });
        case 'function_module':
          return client
            .getFunctionModule(resultsFor(functionModuleDocuments))
            .lock(
              {
                functionGroupName: functionGroupName as string,
                functionModuleName: functionModuleName as string,
              },
              { analyse: analyseLock },
            );
        case 'table':
          return client
            .getTable(resultsFor(tableDocuments))
            .lock({ tableName: objectName }, { analyse: analyseLock });
        case 'structure':
          return client
            .getStructure(resultsFor(structureDocuments))
            .lock({ structureName: objectName }, { analyse: analyseLock });
        case 'ddl':
          return client
            .getDdl(resultsFor(ddlDocuments))
            .lock({ ddlName: objectName }, { analyse: analyseLock });
        case 'domain':
          return client
            .getDomain(resultsFor(domainDocuments))
            .lock({ domainName: objectName }, { analyse: analyseLock });
        case 'data_element':
          return client
            .getDataElement(resultsFor(dataElementDocuments))
            .lock({ dataElementName: objectName }, { analyse: analyseLock });
        case 'behavior_definition':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .lock({ name: objectName }, { analyse: analyseLock });
        case 'metadata_extension':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .lock({ name: objectName }, { analyse: analyseLock });
        case 'package':
          return client.getPackage(resultsFor(packageDocuments)).lock(
            {
              packageName: objectName,
              superPackage: (super_package as string).toUpperCase(),
            },
            { analyse: analyseLock },
          );
        default:
          // Unreachable: objectType was already checked against VALID_TYPES.
          throw new Error(`Unsupported object_type: ${object_type}`);
      }
    },
    (lockHandle: string) => ({
      success: true,
      object_name: objectName,
      object_type: objectType,
      session_id: desiredSessionId,
      lock_handle: lockHandle,
      session_state: null, // Session state management is now handled by auth-broker
      message: `Object ${objectName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
    }),
  );
}
