/**
 * ValidateBehaviorImplementation Handler - Validate ABAP Behavior Implementation Class Name
 *
 * Uses CrudClient.validateBehaviorImplementation from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, parseValidationResponse, restoreSessionInConnection  } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorImplementationBuilderConfig } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "ValidateBehaviorImplementationLow",
  description: "[low-level] Validate an ABAP behavior implementation class name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Behavior Implementation class name to validate (e.g., ZBP_MY_ENTITY)."
      },
      behavior_definition: {
        type: "string",
        description: "Behavior Definition name (e.g., ZI_MY_ENTITY). Required for validation."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation."
      },
      description: {
        type: "string",
        description: "Class description. Required for validation."
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
    required: ["class_name", "behavior_definition", "package_name", "description"]
  }
} as const;

interface ValidateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
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
 * Main handler for ValidateBehaviorImplementation MCP tool
 *
 * Uses CrudClient.validateBehaviorImplementation - low-level single method call
 */
export async function handleValidateBehaviorImplementation(context: HandlerContext, args: ValidateBehaviorImplementationArgs) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      behavior_definition,
      package_name,
      description,
      session_id,
      session_state
    } = args as ValidateBehaviorImplementationArgs;

    // Validation
    if (!class_name || !behavior_definition || !package_name || !description) {
      return return_error(new Error('class_name, behavior_definition, package_name, and description are required'));
    }

        const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const className = class_name.toUpperCase();
    const behaviorDefinition = behavior_definition.toUpperCase();

    logger.info(`Starting behavior implementation validation: ${className} for ${behaviorDefinition}`);

    try {
      // Validate behavior implementation
      const validateConfig: Partial<BehaviorImplementationBuilderConfig> & Pick<BehaviorImplementationBuilderConfig, 'className' | 'packageName' | 'behaviorDefinition'> = {
        className: className,
        behaviorDefinition: behaviorDefinition,
        packageName: package_name.toUpperCase(),
        description: description
      };
      await client.validateBehaviorImplementation(validateConfig);
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation


      logger.info(`✅ ValidateBehaviorImplementation completed: ${className}`);
      logger.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          class_name: className,
          behavior_definition: behaviorDefinition,
          validation_result: result,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: result.valid
            ? `Behavior Implementation ${className} is valid and available`
            : `Behavior Implementation ${className} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error validating behavior implementation ${className}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to validate behavior implementation: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Behavior Implementation ${className} not found.`;
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
