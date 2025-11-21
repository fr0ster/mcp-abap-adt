/**
 * UpdateClassSource Handler - Update Existing ABAP Class Source Code
 *
 * Uses ClassBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateClassSource",
  description: "Update source code of an existing ABAP class. Locks the class, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing classes without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections."
      },
      activate: {
        type: "boolean",
        description: "Activate class after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["class_name", "source_code"]
  }
} as const;

interface UpdateClassSourceArgs {
  class_name: string;
  source_code: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateClassSource
 *
 * Uses ClassBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateClassSource(params: any) {
  const args: UpdateClassSourceArgs = params;

  // Validate required parameters
  if (!args.class_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: class_name and source_code"));
  }

  const className = args.class_name.toUpperCase();
  const connection = getManagedConnection();

  logger.info(`Starting UpdateClassSource for ${className}`);

  try {
    // Create client
    const client = new CrudClient(connection);

    // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
    const shouldActivate = args.activate === true; // Default to false if not specified

    // Validate
    await client.validateClass(className);

    // Lock
    await client.lockClass(className);
    const lockHandle = client.getLockHandle();

    try {
      // Update source code
      await client.updateClass(className, args.source_code, lockHandle);

      // Check
      await client.checkClass(className);

      // Unlock
      await client.unlockClass(className, lockHandle);

      // Activate if requested
      if (shouldActivate) {
        await client.activateClass(className);
      }
    } catch (error) {
      // Try to unlock on error
      try {
        await client.unlockClass(className, lockHandle);
      } catch (unlockError) {
        logger.error('Failed to unlock class after error:', unlockError);
      }
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
    const stepsCompleted = ['lock', 'update', 'check', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }

    const result = {
      success: true,
      class_name: className,
      type: 'CLAS/OC',
      message: shouldActivate
        ? `Class ${className} source updated and activated successfully`
        : `Class ${className} source updated successfully (not activated)`,
      uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
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
    logger.error(`Error updating class ${className}:`, error);
    const errorMessage = error.response?.data
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message || String(error);

    return return_error(new Error(`Failed to update class ${className}: ${errorMessage}`));
  }
}
