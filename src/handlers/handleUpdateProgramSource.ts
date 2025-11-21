/**
 * UpdateProgramSource Handler - Update Existing ABAP Program Source Code
 *
 * Uses ProgramBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateProgramSource",
  description: "Update source code of an existing ABAP program. Locks the program, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP program source code."
      },
      activate: {
        type: "boolean",
        description: "Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["program_name", "source_code"]
  }
} as const;

interface UpdateProgramSourceArgs {
  program_name: string;
  source_code: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateProgramSource MCP tool
 *
 * Uses ProgramBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateProgramSource(params: any) {
  try {
    const args: UpdateProgramSourceArgs = params;

    // Validate required parameters
    if (!args.program_name || !args.source_code) {
      return return_error(new Error("Missing required parameters: program_name and source_code"));
    }

    const connection = getManagedConnection();
    const programName = args.program_name.toUpperCase();

    logger.info(`Starting program source update: ${programName}`);

    try {
      // Create builder with configuration
      const builder = new CrudClient(connection);

      // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = args.activate === true; // Default to false if not specified

      await builder
        .validateProgram(programName)
        .then(b => b.lockProgram(programName))
        .then(b => b.updateProgram(programName, args.source_code))
        .then(b => b.checkProgram(programName))
        .then(b => b.unlockProgram(programName))
        .then(b => shouldActivate ? b.activateProgram(programName) : Promise.resolve(b))
        .catch(error => {
          logger.error('Program update chain failed:', error);
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

      logger.info(`✅ UpdateProgramSource completed successfully: ${programName}`);

      // Return success result
      const stepsCompleted = ['validate', 'lock', 'update', 'check', 'unlock'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        program_name: programName,
        type: 'PROG/P',
        message: shouldActivate
          ? `Program ${programName} source updated and activated successfully`
          : `Program ${programName} source updated successfully (not activated)`,
        uri: `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}`,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        source_size_bytes: args.source_code.length
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      logger.error(`Error updating program source ${programName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update program ${programName}: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
