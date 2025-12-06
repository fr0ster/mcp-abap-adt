/**
 * CreateMetadataExtension Handler - ABAP Metadata Extension Creation via ADT API
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
    name: "CreateMetadataExtension",
    description: "Create a new ABAP Metadata Extension (DDLX) in SAP system.",
    inputSchema: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "Metadata Extension name"
            },
            description: {
                type: "string",
                description: "Description"
            },
            package_name: {
                type: "string",
                description: "Package name"
            },
            transport_request: {
                type: "string",
                description: "Transport request number"
            },
            activate: {
                type: "boolean",
                description: "Activate after creation. Default: true"
            }
        },
        required: ["name", "package_name"]
    }
} as const;

interface CreateMetadataExtensionArgs {
    name: string;
    description?: string;
    package_name: string;
    transport_request?: string;
    activate?: boolean;
}

export async function handleCreateMetadataExtension(params: any) {
    const args: CreateMetadataExtensionArgs = params;

    if (!args.name || !args.package_name) {
        return return_error(new Error("Missing required parameters"));
    }

    try {
        validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
        return return_error(error as Error);
    }

    const name = args.name.toUpperCase();
    const connection = getManagedConnection();

    logger.info(`Starting DDLX creation: ${name}`);

    try {
        const client = new CrudClient(connection);
        const shouldActivate = args.activate !== false;

        // Create
        await client.createMetadataExtension({
            name,
            description: args.description || name,
            packageName: args.package_name,
            transportRequest: args.transport_request || ''
        });

        // Lock
        await client.lockMetadataExtension({ name: name });
        const lockHandle = client.getLockHandle();

        try {
          // Check
          await client.checkMetadataExtension({ name: name });

          // Unlock
          await client.unlockMetadataExtension({ name: name }, lockHandle);

          // Activate if requested
          if (shouldActivate) {
              await client.activateMetadataExtension({ name: name });
          }
        } catch (error) {
          // Unlock on error (principle 1: if lock was done, unlock is mandatory)
          try {
            await client.unlockMetadataExtension({ name: name }, lockHandle);
          } catch (unlockError) {
            logger.error('Failed to unlock metadata extension after error:', unlockError);
          }
          // Principle 2: first error and exit
          throw error;
        }

        const result = {
            success: true,
            name: name,
            package_name: args.package_name,
            type: 'DDLX',
            message: shouldActivate
                ? `Metadata Extension ${name} created and activated successfully`
                : `Metadata Extension ${name} created successfully`
        };

        return return_response({
            data: JSON.stringify(result, null, 2),
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any
        });

    } catch (error: any) {
        logger.error(`Error creating DDLX ${name}:`, error);
        return return_error(error);
    }
}
