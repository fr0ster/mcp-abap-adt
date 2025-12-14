/**
 * CreateBehaviorImplementation Handler - ABAP Behavior Implementation Creation via ADT API
 *
 * Uses CrudClient from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by client.
 *
 * Workflow: create -> lock -> update main source -> update implementations -> unlock -> activate
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger as baseLogger } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorImplementationBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

import { getManagedConnection } from '../../../lib/utils.js';
export const TOOL_DEFINITION = {
  name: "CreateBehaviorImplementation",
  description: "Create a new ABAP behavior implementation class for a behavior definition. Behavior implementations contain the business logic for RAP entities. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations)."
      },
      behavior_definition: {
        type: "string",
        description: "Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist."
      },
      description: {
        type: "string",
        description: "Class description. If not provided, class_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      implementation_code: {
        type: "string",
        description: "Implementation code for the implementations include (optional). Contains the actual behavior implementation methods."
      },
      activate: {
        type: "boolean",
        description: "Activate behavior implementation after creation. Default: true."
      }
    },
    required: ["class_name", "behavior_definition", "package_name"]
  }
} as const;

interface CreateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  implementation_code?: string;
  activate?: boolean;
}

/**
 * Main handler for CreateBehaviorImplementation MCP tool
 *
 * Uses CrudClient.createBehaviorImplementation - full workflow
 */
export async function handleCreateBehaviorImplementation(args: CreateBehaviorImplementationArgs) {
  const handlerLogger = getHandlerLogger(
    'handleCreateBehaviorImplementation',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  let connection: any = null;
  try {
    // Validate required parameters
    if (!args?.class_name) {
      return return_error(new Error('class_name is required'));
    }
    if (!args?.behavior_definition) {
      return return_error(new Error('behavior_definition is required'));
    }
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const typedArgs = args as CreateBehaviorImplementationArgs;
            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    connection = getManagedConnection();
    const className = typedArgs.class_name.toUpperCase();
    const behaviorDefinition = typedArgs.behavior_definition.toUpperCase();

    handlerLogger.info(`Starting behavior implementation creation: ${className} for ${behaviorDefinition}`);

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      // Create behavior implementation (full workflow)
      const createConfig: Partial<BehaviorImplementationBuilderConfig> & Pick<BehaviorImplementationBuilderConfig, 'className' | 'packageName' | 'behaviorDefinition'> = {
        className: className,
        behaviorDefinition: behaviorDefinition,
        description: typedArgs.description || className,
        packageName: typedArgs.package_name.toUpperCase(),
        transportRequest: typedArgs.transport_request,
        ...(typedArgs.implementation_code && { sourceCode: typedArgs.implementation_code })
      };

      await client.createBehaviorImplementation(createConfig);
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for behavior implementation ${className}`);
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && client.getActivateResult()) {
        const activateResponse = client.getActivateResult()!;
        if (typeof activateResponse.data === 'string' && activateResponse.data.includes('<chkl:messages')) {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const result = parser.parse(activateResponse.data);
          const messages = result?.['chkl:messages']?.['msg'];
          if (messages) {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            activationWarnings = msgArray.map((msg: any) =>
              `${msg['@_type']}: ${msg['shortText']?.['txt'] || 'Unknown'}`
            );
          }
        }
      }

      handlerLogger.info(`✅ CreateBehaviorImplementation completed successfully: ${className}`);

      // Return success result
      const stepsCompleted = ['create', 'lock', 'update_main_source'];
      if (typedArgs.implementation_code) {
        stepsCompleted.push('update_implementations');
      }
      stepsCompleted.push('unlock');
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        class_name: className,
        behavior_definition: behaviorDefinition,
        package_name: typedArgs.package_name.toUpperCase(),
        transport_request: typedArgs.transport_request || null,
        type: 'CLAS/OC',
        message: shouldActivate
          ? `Behavior Implementation ${className} created and activated successfully`
          : `Behavior Implementation ${className} created successfully (not activated)`,
        uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      handlerLogger.error(`Error creating behavior implementation ${className}: ${error?.message || error}`);

      // Check if behavior implementation already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        return return_error(new Error(`Behavior Implementation ${className} already exists. Please delete it first or use a different name.`));
      }

      // Parse error message
      let errorMessage = `Failed to create behavior implementation: ${error.message || String(error)}`;

      if (error.response?.data && typeof error.response.data === 'string') {
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
    handlerLogger.error(`CreateBehaviorImplementation handler error: ${error?.message || error}`);
    return return_error(error);
  } finally {
    try {
      if (connection) {
        connection.reset();
        handlerLogger.debug('Reset behavior implementation connection after use');
      }
    } catch (resetError: any) {
      handlerLogger.error(`Failed to reset behavior implementation connection: ${resetError?.message || resetError}`);
    }
  }
}
