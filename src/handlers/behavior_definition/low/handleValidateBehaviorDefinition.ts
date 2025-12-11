/**
 * ValidateBehaviorDefinition Handler - Validate ABAP BehaviorDefinition Name
 *
 * Uses CrudClient.validateBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection, parseValidationResponse } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig, BehaviorDefinitionValidationParams, BehaviorDefinitionImplementationType } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ValidateBehaviorDefinitionLow",
  description: "[low-level] Validate an ABAP behavior definition name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "BehaviorDefinition name to validate (e.g., ZI_MY_BDEF)."
      },
      root_entity: {
        type: "string",
        description: "Root entity name (e.g., ZI_MY_ENTITY). Required for validation."
      },
      implementation_type: {
        type: "string",
        description: "Implementation type: 'Managed', 'Unmanaged', 'Abstract', or 'Projection'.",
        enum: ["Managed", "Unmanaged", "Abstract", "Projection"]
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation."
      },
      description: {
        type: "string",
        description: "BehaviorDefinition description. Required for validation."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["name", "root_entity", "implementation_type", "package_name", "description"]
  }
} as const;

interface ValidateBehaviorDefinitionArgs {
  name: string;
  root_entity: string;
  implementation_type: BehaviorDefinitionImplementationType;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateBehaviorDefinition MCP tool
 *
 * Uses CrudClient.validateBehaviorDefinition - low-level single method call
 */
export async function handleValidateBehaviorDefinition(args: ValidateBehaviorDefinitionArgs) {
  try {
    const {
      name,
      root_entity,
      implementation_type,
      package_name,
      description,
      session_id,
      session_state
    } = args as ValidateBehaviorDefinitionArgs;

    // Validation
    if (!name || !root_entity || !implementation_type || !package_name || !description) {
      return return_error(new Error('name, root_entity, implementation_type, package_name, and description are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const handlerLogger = getHandlerLogger(
      'handleValidateBehaviorDefinition',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    const bdefName = name.toUpperCase();

    handlerLogger.info(`Starting behavior definition validation: ${bdefName}`);

    try {
      // Validate behavior definition - using BehaviorDefinitionValidationParams from adt-clients
      // Note: In SAP ADT validation API, objname and rootEntity are both required parameters
      // but they must have the same value (one value in two parameters)
      // We use root_entity for both since it's the actual CDS view name
      const validateParams: BehaviorDefinitionValidationParams = {
        objname: root_entity, // objname - same as rootEntity
        rootEntity: root_entity, // rootEntity - CDS view name
        description: description,
        package: package_name.toUpperCase(),
        implementationType: implementation_type
      };

      // CrudClient.validateBehaviorDefinition expects BehaviorDefinitionBuilderConfig,
      // but we use BehaviorDefinitionValidationParams structure for clarity
      // Convert to the format expected by CrudClient
      await client.validateBehaviorDefinition({
        name: validateParams.objname,
        rootEntity: validateParams.rootEntity,
        description: validateParams.description,
        packageName: validateParams.package,
        implementationType: validateParams.implementationType
      });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ ValidateBehaviorDefinition completed: ${bdefName}`);
      handlerLogger.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          name: bdefName,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `BehaviorDefinition ${bdefName} is valid and available`
            : `BehaviorDefinition ${bdefName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error validating behavior definition ${bdefName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to validate behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${bdefName} not found.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
