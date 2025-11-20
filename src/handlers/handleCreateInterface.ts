/**
 * CreateInterface Handler - ABAP Interface Creation via ADT API
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { InterfaceBuilder } from '@mcp-abap-adt/adt-clients';

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
      },
      master_system: {
        type: "string",
        description: "Master system ID (e.g., 'TRL' for cloud trial). Optional - will be retrieved from system if not provided."
      },
      responsible: {
        type: "string",
        description: "User responsible for the object (e.g., 'CB9980002377'). Optional - will be retrieved from system if not provided."
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
  master_system?: string;
  responsible?: string;
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
 * Session and lock management handled internally by builder
 */
export async function handleCreateInterface(args: any) {
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

      // Create builder with configuration
      const builder = new InterfaceBuilder(connection, logger, {
        interfaceName: interfaceName,
        packageName: typedArgs.package_name,
        transportRequest: typedArgs.transport_request,
        description: typedArgs.description || interfaceName,
        sourceCode: sourceCode
      });

      // Build operation chain: validate -> create -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      await builder
        .validate()
        .then(b => b.create())
        .then(b => b.lock())
        .then(b => b.update())
        .then(b => b.check())
        .then(b => b.unlock())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Interface creation chain failed:', error);
          throw error;
        });

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && builder.getActivateResult()) {
        const activateResponse = builder.getActivateResult()!;
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

      logger.info(`✅ CreateInterface completed successfully: ${interfaceName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          interface_name: interfaceName,
          package_name: typedArgs.package_name,
          transport_request: typedArgs.transport_request || 'local',
          activated: shouldActivate,
          message: `Interface ${interfaceName} created successfully${shouldActivate ? ' and activated' : ''}`,
          activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating interface ${interfaceName}:`, error);

      // Check if interface already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        return return_error(new Error(`Interface ${interfaceName} already exists. Please delete it first or use a different name.`));
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to create interface ${interfaceName}: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
