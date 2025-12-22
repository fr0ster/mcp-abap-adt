/**
 * ValidateObject Handler - Validate ABAP object name via ADT API
 *
 * Uses validateObjectName from @mcp-abap-adt/adt-clients/core for all operations.
 * Connection management handled internally.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseValidationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateObjectLow',
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
          "Object type: 'class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element', 'package', 'behavior_definition', 'behavior_implementation', 'metadata_extension'",
        enum: [
          'class',
          'program',
          'interface',
          'function_group',
          'table',
          'structure',
          'view',
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
}

/**
 * Main handler for ValidateObject MCP tool
 *
 * Uses validateObjectName from @mcp-abap-adt/adt-clients/core for all operations
 * Connection management handled internally
 */
export async function handleValidateObject(
  context: HandlerContext,
  args: ValidateObjectArgs,
) {
  const { connection, logger } = context;
  try {
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

    // Validation
    if (!object_name || !object_type) {
      return return_error(
        new Error('object_name and object_type are required'),
      );
    }

    const validTypes = [
      'class',
      'program',
      'interface',
      'function_group',
      'table',
      'structure',
      'view',
      'domain',
      'data_element',
      'package',
      'behavior_definition',
      'behavior_implementation',
      'metadata_extension',
      'ddlx/ex',
    ];
    const normalizedType = object_type.toLowerCase();
    if (!validTypes.includes(normalizedType)) {
      return return_error(
        new Error(
          `Invalid object_type. Must be one of: ${validTypes.join(', ')}`,
        ),
      );
    }

    const validationClient = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const objectName = object_name.toUpperCase();

    logger?.info(
      `Starting object validation: ${objectName} (type: ${object_type})`,
    );

    try {
      // Validate object using specific validation method based on type
      let result: any;

      switch (normalizedType) {
        case 'program': {
          await validationClient.validateProgram({
            programName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const programResponse = validationClient.getValidationResponse();
          if (!programResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(programResponse);
          break;
        }
        case 'class': {
          await validationClient.validateClass({
            className: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const classResponse = validationClient.getValidationResponse();
          if (!classResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(classResponse);
          break;
        }
        case 'interface': {
          await validationClient.validateInterface({
            interfaceName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const interfaceResponse = validationClient.getValidationResponse();
          if (!interfaceResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(interfaceResponse);
          break;
        }
        case 'function_group': {
          await validationClient.validateFunctionGroup({
            functionGroupName: objectName,
            description: description || undefined,
          });
          const functionGroupResponse =
            validationClient.getValidationResponse();
          if (!functionGroupResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(functionGroupResponse);
          break;
        }
        case 'table': {
          await validationClient.validateTable({
            tableName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const tableResponse = validationClient.getValidationResponse();
          if (!tableResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(tableResponse);
          break;
        }
        case 'structure': {
          await validationClient.validateStructure({
            structureName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const structureResponse = validationClient.getValidationResponse();
          if (!structureResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(structureResponse);
          break;
        }
        case 'view': {
          await validationClient.validateView({
            viewName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const viewResponse = validationClient.getValidationResponse();
          if (!viewResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(viewResponse);
          break;
        }
        case 'domain': {
          await validationClient.validateDomain({
            domainName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const domainResponse = validationClient.getValidationResponse();
          if (!domainResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(domainResponse);
          break;
        }
        case 'data_element': {
          await validationClient.validateDataElement({
            dataElementName: objectName,
            packageName: package_name || undefined,
            description: description || undefined,
          });
          const dataElementResponse = validationClient.getValidationResponse();
          if (!dataElementResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(dataElementResponse);
          break;
        }
        case 'package': {
          await validationClient.validatePackage({
            packageName: objectName,
            superPackage: undefined, // package doesn't have superPackage in args
            description: description || undefined,
          });
          const packageResponse = validationClient.getValidationResponse();
          if (!packageResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(packageResponse);
          break;
        }
        case 'behavior_definition': {
          if (
            !package_name ||
            !description ||
            !root_entity ||
            !implementation_type
          ) {
            return return_error(
              new Error(
                'Behavior definition validation requires packageName, description, rootEntity, and implementationType parameters',
              ),
            );
          }
          const validImplementationTypes = [
            'Managed',
            'Unmanaged',
            'Abstract',
            'Projection',
          ];
          const normalizedImplementationType =
            implementation_type.charAt(0).toUpperCase() +
            implementation_type.slice(1).toLowerCase();
          if (
            !validImplementationTypes.includes(normalizedImplementationType)
          ) {
            return return_error(
              new Error(
                `Invalid implementationType. Must be one of: ${validImplementationTypes.join(', ')}`,
              ),
            );
          }
          await validationClient.validateBehaviorDefinition({
            name: objectName,
            packageName: package_name,
            description: description,
            rootEntity: root_entity,
            implementationType: normalizedImplementationType as
              | 'Managed'
              | 'Unmanaged'
              | 'Abstract'
              | 'Projection',
          });
          const behaviorDefinitionResponse =
            validationClient.getValidationResponse();
          if (!behaviorDefinitionResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(behaviorDefinitionResponse);
          break;
        }
        case 'behavior_implementation': {
          if (!package_name) {
            return return_error(
              new Error(
                'Behavior implementation validation requires packageName parameter',
              ),
            );
          }
          await validationClient.validateBehaviorImplementation({
            className: objectName,
            packageName: package_name,
            behaviorDefinition: behavior_definition || '',
            ...(description && { description }),
          });
          const behaviorImplementationResponse =
            validationClient.getValidationResponse();
          if (!behaviorImplementationResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(behaviorImplementationResponse);
          break;
        }
        case 'metadata_extension':
        case 'ddlx/ex': {
          if (!package_name || !description) {
            return return_error(
              new Error(
                'Metadata extension validation requires description and packageName parameters',
              ),
            );
          }
          await validationClient.validateMetadataExtension({
            name: objectName,
            description: description,
            packageName: package_name,
          });
          const metadataExtensionResponse =
            validationClient.getValidationResponse();
          if (!metadataExtensionResponse) {
            throw new Error('Validation did not return a result');
          }
          result = parseValidationResponse(metadataExtensionResponse);
          break;
        }
        default:
          throw new Error(`Unsupported object type: ${object_type}`);
      }

      // Get updated session state after validation

      logger?.info(`✅ ValidateObject completed: ${objectName}`);
      logger?.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify(
          {
            success: result.valid,
            object_name: objectName,
            object_type,
            validation_result: result,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: result.valid
              ? `Object name ${objectName} is valid and available`
              : `Object name ${objectName} validation failed: ${result.message}`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(`ValidateObject ${objectName}`, error);

      // Parse error message
      let errorMessage = `Failed to validate object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
