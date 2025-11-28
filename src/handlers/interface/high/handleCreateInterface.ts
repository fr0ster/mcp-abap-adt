/**
 * CreateInterface Handler - ABAP Interface Creation via ADT API
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by client.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection, safeCheckOperation } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateInterface",
  description: "Create a new ABAP interface in SAP system with source code. Interfaces define method signatures, events, and types for implementation by classes. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: {
        type: "string",
        description: "Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y)."
      },
      description: {
        type: "string",
        description: "Interface description. If not provided, interface_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP interface source code with INTERFACE...ENDINTERFACE section. If not provided, generates minimal template."
      },
      activate: {
        type: "boolean",
        description: "Activate interface after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["interface_name", "package_name"]
  }
} as const;

interface CreateInterfaceArgs {
  interface_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  source_code?: string;
  activate?: boolean;
}

/**
 * Generate minimal interface source code if not provided
 */
function generateInterfaceTemplate(interfaceName: string, description: string): string {
  return `INTERFACE ${interfaceName}
  PUBLIC.

  " ${description}

  METHODS: get_value
    RETURNING VALUE(rv_result) TYPE string.

ENDINTERFACE.`;
}


/**
 * Main handler for CreateInterface MCP tool
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by client
 */
export async function handleCreateInterface(args: CreateInterfaceArgs) {
  try {
    // Validate required parameters
    if (!args?.interface_name) {
      return return_error(new Error('interface_name is required'));
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

    const typedArgs = args as CreateInterfaceArgs;
    const connection = getManagedConnection();
    const interfaceName = typedArgs.interface_name.toUpperCase();

    logger.info(`Starting interface creation: ${interfaceName}`);

    try {
      // Generate source code if not provided
      const sourceCode = typedArgs.source_code || generateInterfaceTemplate(interfaceName, typedArgs.description || interfaceName);

      // Create CrudClient
      const client = new CrudClient(connection);
      const description = typedArgs.description || interfaceName;
      const packageName = typedArgs.package_name;
      const transportRequest = typedArgs.transport_request || '';
      const shouldActivate = typedArgs.activate !== false;

      // Execute the workflow
      try {
        await client.createInterface({
          interfaceName,
          description,
          packageName,
          transportRequest
        });
        await client.lockInterface({ interfaceName });
        await client.updateInterface({ interfaceName, sourceCode });
        try {
          await safeCheckOperation(
            () => client.checkInterface({ interfaceName }),
            interfaceName,
            {
              debug: (message: string) => logger.info(`[CreateInterface] ${message}`)
            }
          );
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if (!(checkError as any).isAlreadyChecked) {
            // Real check error - rethrow
            throw checkError;
          }
        }
        await client.unlockInterface({ interfaceName });
        if (shouldActivate) {
          await client.activateInterface({ interfaceName });
        }
      } catch (error) {
        logger.error('Interface creation chain failed:', error);
        throw error;
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

      // Return success result
      const stepsCompleted = ['validate', 'create', 'lock', 'update', 'check', 'unlock'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        interface_name: interfaceName,
        package_name: packageName,
        transport_request: transportRequest || null,
        type: 'INTF/OI',
        message: shouldActivate
          ? `Interface ${interfaceName} created and activated successfully`
          : `Interface ${interfaceName} created successfully (not activated)`,
        uri: `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName).toLowerCase()}`,
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
      logger.error('Interface creation failed:', error);
      return return_error(error);
    }
  } catch (error: any) {
    logger.error('CreateInterface handler error:', error);
    return return_error(error);
  }
}
