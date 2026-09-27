/**
 * UnlockObject Handler - Unlock ABAP object after modification via ADT API
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level UnlockX handler in this migration uses.
 *
 * `unlock()` takes `analyseException` too (adt-clients 23), and its success
 * value is SAP's reply, read by nothing. There is no `AdtReading` to read a status off (unlock does not
 * go through the result-set strategies at all), so the synthetic 200 below is
 * a stand-in for "the call answered ok" rather than a status read off the
 * wire — `answer()` only reaches this projection once `ok` is already `true`.
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
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockObjectLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Unlock an ABAP object after modification. Must use the same session_id and lock_handle from the LockObject operation.',
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
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockObject operation',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockObject operation. Must be the same session.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['object_name', 'object_type', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockObjectArgs {
  object_name: string;
  object_type: string;
  lock_handle: string;
  session_id: string;
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

export async function handleUnlockObject(
  context: HandlerContext,
  args: UnlockObjectArgs,
) {
  const { connection, logger } = context;
  const { object_name, object_type, lock_handle, session_id, session_state } =
    args as UnlockObjectArgs;

  if (!object_name || !object_type || !lock_handle || !session_id) {
    return return_error(
      new Error(
        'object_name, object_type, lock_handle, and session_id are required',
      ),
    );
  }

  const objectType = object_type.toLowerCase();
  if (!VALID_TYPES.includes(objectType)) {
    return return_error(
      new Error(
        `Invalid object_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      ),
    );
  }

  // Request-shape check that stays ahead of the client call, exactly where it
  // lived before this migration: `unlock()`'s config does not itself enforce
  // it.
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

  if (session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const objectName = object_name.toUpperCase();
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'UnlockObjectLow', detail: 'terse' },
    () => {
      switch (objectType) {
        case 'class':
          return client
            .getClass(resultsFor(classDocuments))
            .unlock({ className: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'program':
          return client
            .getProgram(resultsFor(programDocuments))
            .unlock({ programName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'interface':
          return client
            .getInterface(resultsFor(interfaceDocuments))
            .unlock({ interfaceName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'function_group':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .unlock({ functionGroupName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'function_module':
          return client
            .getFunctionModule(resultsFor(functionModuleDocuments))
            .unlock(
              {
                functionGroupName: functionGroupName as string,
                functionModuleName: functionModuleName as string,
              },
              lock_handle,
              { analyse: analyseException },
            );
        case 'table':
          return client
            .getTable(resultsFor(tableDocuments))
            .unlock({ tableName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'structure':
          return client
            .getStructure(resultsFor(structureDocuments))
            .unlock({ structureName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'ddl':
          return client
            .getDdl(resultsFor(ddlDocuments))
            .unlock({ ddlName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'domain':
          return client
            .getDomain(resultsFor(domainDocuments))
            .unlock({ domainName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'data_element':
          return client
            .getDataElement(resultsFor(dataElementDocuments))
            .unlock({ dataElementName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'package':
          return client
            .getPackage(resultsFor(packageDocuments))
            .unlock({ packageName: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'behavior_definition':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .unlock({ name: objectName }, lock_handle, {
              analyse: analyseException,
            });
        case 'metadata_extension':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .unlock({ name: objectName }, lock_handle, {
              analyse: analyseException,
            });
        default:
          // Unreachable: objectType was already checked against VALID_TYPES.
          throw new Error(`Unsupported object_type: ${object_type}`);
      }
    },
    (value) => terseWrite(value, 200),
  );
}
