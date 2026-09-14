/**
 * DeleteObject Handler - Delete ABAP objects via ADT API
 *
 * A dispatcher: one branch runs per call, over the same family clients every
 * low-level DeleteX handler in this migration uses. Each branch carries its
 * own `resultsFor(xDocuments)` and `analyseDeletion`, so a refusal ADT embeds
 * in a 200 (deletion answers `del:deletionResult`/`del:checkResponse` the same
 * way for every family) is read as a failure here too.
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
  programDocuments,
  structureDocuments,
  tableDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteObjectLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Delete an ABAP object via ADT deletion API. Transport request optional for $TMP objects. Note: object_type "program" is onprem/legacy only — calling it on ABAP Cloud will fail.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: 'Object name (e.g., ZCL_MY_CLASS)',
      },
      object_type: {
        type: 'string',
        description:
          'Object type. Supported: class, program (onprem/legacy only), interface, function_group, function_module, table, structure, ddl, domain, data_element, behavior_definition, metadata_extension. Also accepts ADT codes (clas/oc, prog/p, intf/oi, fugr/f, fugr/ff, tabl/dt, ttyp/st, ddls/df, doma/dm, dtel/de, bdef/bd, ddlx/ex).',
      },
      function_group_name: {
        type: 'string',
        description: 'Required only for function_module type',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface DeleteObjectArgs {
  object_name: string;
  object_type: string;
  function_group_name?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

const VALID_TYPES = [
  'class',
  'clas/oc',
  'program',
  'prog/p',
  'interface',
  'intf/oi',
  'function_group',
  'fugr/f',
  'function_module',
  'fugr/ff',
  'table',
  'tabl/dt',
  'structure',
  'ttyp/st',
  'ddl',
  'ddls/df',
  'domain',
  'doma/dm',
  'data_element',
  'dtel/de',
  'behavior_definition',
  'bdef/bd',
  'metadata_extension',
  'ddlx/ex',
];

export async function handleDeleteObject(
  context: HandlerContext,
  args: DeleteObjectArgs,
) {
  const { connection, logger } = context;
  const { object_name, object_type, function_group_name, transport_request } =
    args as DeleteObjectArgs;

  if (!object_name || !object_type) {
    return return_error(new Error('object_name and object_type are required'));
  }

  const objectType = object_type.toLowerCase();
  if (!VALID_TYPES.includes(objectType)) {
    return return_error(new Error(`Unsupported object_type: ${object_type}`));
  }
  const objectName = object_name.toUpperCase();

  // function_module needs a second name the others don't carry; that stays a
  // request-shape check ahead of the client call, same as before.
  let functionGroupName: string | undefined;
  if (objectType === 'function_module' || objectType === 'fugr/ff') {
    if (!function_group_name) {
      return return_error(
        new Error(
          'function_group_name is required for function_module deletion.',
        ),
      );
    }
    functionGroupName = function_group_name.toUpperCase();
  }

  const detail = detailOf(args);
  const client = createAdtClient(connection, logger);

  return answer(
    { tool: 'DeleteObjectLow', detail },
    () => {
      switch (objectType) {
        case 'class':
        case 'clas/oc':
          return client
            .getClass(resultsFor(classDocuments))
            .delete(
              { className: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        case 'program':
        case 'prog/p':
          return client
            .getProgram(resultsFor(programDocuments))
            .delete(
              { programName: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        case 'interface':
        case 'intf/oi':
          return client.getInterface(resultsFor(interfaceDocuments)).delete(
            {
              interfaceName: objectName,
              transportRequest: transport_request,
            },
            { analyse: analyseDeletion },
          );
        case 'function_group':
        case 'fugr/f':
          return client
            .getFunctionGroup(resultsFor(functionGroupDocuments))
            .delete(
              {
                functionGroupName: objectName,
                transportRequest: transport_request,
              },
              { analyse: analyseDeletion },
            );
        case 'function_module':
        case 'fugr/ff':
          return client
            .getFunctionModule(resultsFor(functionModuleDocuments))
            .delete(
              {
                functionGroupName: functionGroupName as string,
                functionModuleName: objectName,
                transportRequest: transport_request,
              },
              { analyse: analyseDeletion },
            );
        case 'table':
        case 'tabl/dt':
          return client
            .getTable(resultsFor(tableDocuments))
            .delete(
              { tableName: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        case 'structure':
        case 'ttyp/st':
          return client.getStructure(resultsFor(structureDocuments)).delete(
            {
              structureName: objectName,
              transportRequest: transport_request,
            },
            { analyse: analyseDeletion },
          );
        case 'ddl':
        case 'ddls/df':
          return client
            .getDdl(resultsFor(ddlDocuments))
            .delete(
              { ddlName: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        case 'domain':
        case 'doma/dm':
          return client
            .getDomain(resultsFor(domainDocuments))
            .delete(
              { domainName: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        case 'data_element':
        case 'dtel/de':
          return client.getDataElement(resultsFor(dataElementDocuments)).delete(
            {
              dataElementName: objectName,
              transportRequest: transport_request,
            },
            { analyse: analyseDeletion },
          );
        case 'behavior_definition':
        case 'bdef/bd':
          return client
            .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
            .delete(
              { name: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        case 'metadata_extension':
        case 'ddlx/ex':
          return client
            .getMetadataExtension(resultsFor(metadataExtensionDocuments))
            .delete(
              { name: objectName, transportRequest: transport_request },
              { analyse: analyseDeletion },
            );
        default:
          throw new Error(`Unsupported object_type: ${object_type}`);
      }
    },
    project(detail, terseDeletion),
  );
}
