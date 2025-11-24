/**
 * CreateProgram Handler - Create ABAP Program
 *
 * Uses CrudClient.createProgram from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateProgramLow",
  description: "[low-level] Create a new ABAP program. - use CreateProgram (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Program description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      program_type: {
        type: "string",
        description: "Program type: 'executable', 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool' (optional)."
      },
      application: {
        type: "string",
        description: "Application area (optional, default: '*')."
      },
      master_system: {
        type: "string",
        description: "Master system (optional)."
      },
      responsible: {
        type: "string",
        description: "User responsible for the program (optional)."
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
    required: ["program_name", "description", "package_name"]
  }
} as const;

interface CreateProgramArgs {
  program_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  program_type?: string;
  application?: string;
  master_system?: string;
  responsible?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateProgram MCP tool
 *
 * Uses CrudClient.createProgram - low-level single method call
 */
export async function handleCreateProgram(args: any) {
  try {
    const {
      program_name,
      description,
      package_name,
      transport_request,
      program_type,
      application,
      master_system,
      responsible,
      session_id,
      session_state
    } = args as CreateProgramArgs;

    // Validation
    if (!program_name || !description || !package_name) {
      return return_error(new Error('program_name, description, and package_name are required'));
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

    const programName = program_name.toUpperCase();

    logger.info(`Starting program creation: ${programName}`);

    try {
      // Create program
      await client.createProgram(
        programName,
        description,
        package_name,
        transport_request,
        {
          programType: program_type,
          application,
          masterSystem: master_system,
          responsible
        }
      );
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for program ${programName}`);
      }

      // Get updated session state after create
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CreateProgram completed: ${programName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          program_name: programName,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Program ${programName} created successfully. Use LockProgram and UpdateProgram to add source code, then UnlockProgram and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating program ${programName}:`, error);

      // Parse error message
      let errorMessage = `Failed to create program: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Program ${programName} already exists.`;
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

