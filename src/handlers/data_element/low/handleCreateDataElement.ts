/**
 * CreateDataElement Handler - Create ABAP DataElement
 *
 * Uses CrudClient.createDataElement from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateDataElementLow",
  description: "[low-level] Create a new ABAP data element. - use CreateDataElement (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      data_element_name: {
        type: "string",
        description: "DataElement name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "DataElement description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      data_type: {
        type: "string",
        description: "Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'E' or 'domain'."
      },
      type_kind: {
        type: "string",
        description: "Type kind: 'E' for domain-based, 'P' for predefined type, etc."
      },
      type_name: {
        type: "string",
        description: "Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')"
      },
      length: {
        type: "number",
        description: "Data type length (for predefinedAbapType or refToPredefinedAbapType)"
      },
      decimals: {
        type: "number",
        description: "Decimal places (for predefinedAbapType or refToPredefinedAbapType)"
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
    required: ["data_element_name", "description", "package_name"]
  }
} as const;

interface CreateDataElementArgs {
  data_element_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  data_type?: string;
  type_kind?: string;
  type_name?: string;
  length?: number;
  decimals?: number;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateDataElement MCP tool
 *
 * Uses CrudClient.createDataElement - low-level single method call
 */
export async function handleCreateDataElement(args: CreateDataElementArgs) {
  try {
    const {
      data_element_name,
      description,
      package_name,
      transport_request,
      data_type,
      type_kind,
      type_name,
      length,
      decimals,
      session_id,
      session_state
    } = args as CreateDataElementArgs;

    // Validation
    if (!data_element_name || !description || !package_name) {
      return return_error(new Error('data_element_name, description, and package_name are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleCreateDataElement',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const dataElementName = data_element_name.toUpperCase();

    handlerLogger.info(`Starting data element creation: ${dataElementName}`);

    try {
      // Determine typeKind based on type_kind parameter
      // Supports both short form ('E', 'P') and full form ('domain', 'predefinedAbapType')
      const typeKindMap: Record<string, 'domain' | 'predefinedAbapType' | 'refToPredefinedAbapType' | 'refToDictionaryType' | 'refToClifType'> = {
        // Short forms
        'E': 'domain',
        'P': 'predefinedAbapType',
        'R': 'refToPredefinedAbapType',
        'D': 'refToDictionaryType',
        'C': 'refToClifType',
        // Full forms
        'domain': 'domain',
        'predefinedAbapType': 'predefinedAbapType',
        'refToPredefinedAbapType': 'refToPredefinedAbapType',
        'refToDictionaryType': 'refToDictionaryType',
        'refToClifType': 'refToClifType'
      };
      const rawTypeKind = type_kind || 'E';
      const typeKind = typeKindMap[rawTypeKind] || 'domain';

      // Create data element
      const createConfig: any = {
        dataElementName,
        description,
        packageName: package_name,
        typeKind,
        dataType: data_type,
        typeName: type_name,
        length: length,
        decimals: decimals,
        transportRequest: transport_request
      };

      await client.createDataElement(createConfig);
      const createResult = client.getCreateResult();

      if (!createResult) {
        handlerLogger.error(`Create did not return a response for data element ${dataElementName}`);
        throw new Error(`Create did not return a response for data element ${dataElementName}`);
      }

      // Get updated session state after create


      handlerLogger.info(`✅ CreateDataElement completed: ${dataElementName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: dataElementName,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `DataElement ${dataElementName} created successfully. Use LockDataElement and UpdateDataElement to add source code, then UnlockDataElement and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error creating data element ${dataElementName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to create data element: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `DataElement ${dataElementName} already exists.`;
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
