/**
 * CreateBehaviorDefinition Handler - ABAP Behavior Definition Creation via ADT API
 */

import { AxiosResponse } from '../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../../lib/utils';
import { validateTransportRequest } from '../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
    name: "CreateBehaviorDefinition",
    description: "Create a new ABAP Behavior Definition (BDEF) in SAP system.",
    inputSchema: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "Behavior Definition name (usually same as Root Entity name)"
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
            root_entity: {
                type: "string",
                description: "Root Entity name (CDS View name)"
            },
            implementation_type: {
                type: "string",
                description: "Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'",
                enum: ["Managed", "Unmanaged", "Abstract", "Projection"]
            },
            activate: {
                type: "boolean",
                description: "Activate after creation. Default: true"
            }
        },
        required: ["name", "package_name", "root_entity", "implementation_type"]
    }
} as const;

interface CreateBehaviorDefinitionArgs {
    name: string;
    description?: string;
    package_name: string;
    transport_request?: string;
    root_entity: string;
    implementation_type: 'Managed' | 'Unmanaged' | 'Abstract' | 'Projection';
    activate?: boolean;
}

export async function handleCreateBehaviorDefinition(params: any) {
    const args: CreateBehaviorDefinitionArgs = params;

    if (!args.name || !args.package_name || !args.root_entity || !args.implementation_type) {
        return return_error(new Error("Missing required parameters"));
    }

    try {
        validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
        return return_error(error as Error);
    }

    const name = args.name.toUpperCase();
    const connection = getManagedConnection();

    logger.info(`Starting BDEF creation: ${name}`);

    try {
        const client = new CrudClient(connection);
        const shouldActivate = args.activate !== false;

        // Create
        await client.createBehaviorDefinition(
            name,
            args.description || name,
            args.package_name,
            args.transport_request || '',
            args.root_entity,
            args.implementation_type
        );

        // Lock
        await client.lockBehaviorDefinition(name);
        const lockHandle = client.getLockHandle();

        // Check (optional, but good practice)
        await client.checkBehaviorDefinition(name);

        // Unlock
        await client.unlockBehaviorDefinition(name, lockHandle);

        // Activate if requested
        if (shouldActivate) {
            await client.activateBehaviorDefinition(name);
        }

        const result = {
            success: true,
            name: name,
            package_name: args.package_name,
            type: 'BDEF',
            message: shouldActivate
                ? `Behavior Definition ${name} created and activated successfully`
                : `Behavior Definition ${name} created successfully`
        };

        return return_response({
            data: JSON.stringify(result, null, 2),
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any
        });

    } catch (error: any) {
        logger.error(`Error creating BDEF ${name}:`, error);
        return return_error(error);
    }
}
