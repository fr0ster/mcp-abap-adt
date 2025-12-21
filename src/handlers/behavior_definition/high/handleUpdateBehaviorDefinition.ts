/**
 * UpdateBehaviorDefinition Handler - ABAP Behavior Definition Update via ADT API
 */

import { return_error, return_response } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
export const TOOL_DEFINITION = {
    name: "UpdateBehaviorDefinition",
    description: "Update source code of an ABAP Behavior Definition.",
    inputSchema: {
        type: "object",
        properties: {
            name: {
                type: "string",
                description: "Behavior Definition name"
            },
            source_code: {
                type: "string",
                description: "New source code"
            },
            lock_handle: {
                type: "string",
                description: "Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows)."
            },
            activate: {
                type: "boolean",
                description: "Activate after update. Default: true"
            }
        },
        required: ["name", "source_code"]
    }
} as const;

interface UpdateBehaviorDefinitionArgs {
    name: string;
    source_code: string;
    lock_handle?: string;
    activate?: boolean;
}

export async function handleUpdateBehaviorDefinition(context: HandlerContext, params: any) {
    const { connection, logger } = context;
    const args: UpdateBehaviorDefinitionArgs = params;

    if (!args.name || !args.source_code) {
        return return_error(new Error("Missing required parameters"));
    }

    const name = args.name.toUpperCase();
    // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    logger?.info(`Starting BDEF update: ${name}`);

    try {
        const client = new CrudClient(connection);
    const shouldActivate = args.activate !== false;
        let lockHandle = args.lock_handle;

        // Lock if not provided - using types from adt-clients
        if (!lockHandle) {
            const lockConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
            await client.lockBehaviorDefinition(lockConfig);
            lockHandle = client.getLockHandle();
        }

        // Update - using types from adt-clients
        const updateConfig: Pick<BehaviorDefinitionBuilderConfig, 'name' | 'sourceCode'> = {
            name,
            sourceCode: args.source_code
        };
        await client.updateBehaviorDefinition(updateConfig, lockHandle);

        // Unlock if we locked it internally - using types from adt-clients
        if (!args.lock_handle) {
            const unlockConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
            await client.unlockBehaviorDefinition(unlockConfig, lockHandle);
        }

        // Activate if requested - using types from adt-clients
        if (shouldActivate) {
            const activateConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = { name };
            await client.activateBehaviorDefinition(activateConfig);
        }

        const result = {
            success: true,
            name: name,
            message: shouldActivate
                ? `Behavior Definition ${name} updated and activated successfully`
                : `Behavior Definition ${name} updated successfully`
        };

        return return_response({
            data: JSON.stringify(result, null, 2),
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any
        });

    } catch (error: any) {
        logger?.error(`Error updating BDEF ${name}: ${error?.message || error}`);
        return return_error(error);
    }
}
