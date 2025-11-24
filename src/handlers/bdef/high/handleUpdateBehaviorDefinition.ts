/**
 * UpdateBehaviorDefinition Handler - ABAP Behavior Definition Update via ADT API
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

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

export async function handleUpdateBehaviorDefinition(params: any) {
    const args: UpdateBehaviorDefinitionArgs = params;

    if (!args.name || !args.source_code) {
        return return_error(new Error("Missing required parameters"));
    }

    const name = args.name.toUpperCase();
    const connection = getManagedConnection();

    try {
        const client = new CrudClient(connection);
        const shouldActivate = args.activate !== false;
        let lockHandle = args.lock_handle;

        // Lock if not provided
        if (!lockHandle) {
            await client.lockBehaviorDefinition(name);
            lockHandle = client.getLockHandle();
        }

        // Update
        await client.updateBehaviorDefinition(name, args.source_code, lockHandle);

        // Unlock if we locked it internally
        if (!args.lock_handle) {
            await client.unlockBehaviorDefinition(name, lockHandle);
        }

        // Activate if requested
        if (shouldActivate) {
            // Note: If we locked internally, we unlocked, so activation might fail if it requires lock?
            // Usually activation is separate. But if we provided lock_handle, we keep it locked?
            // Standard practice: Update requires lock. Activation might not, or might require its own lock check.
            // CrudClient.activateBehaviorDefinition doesn't take lock handle.
            await client.activateBehaviorDefinition(name);
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
        logger.error(`Error updating BDEF ${name}:`, error);
        return return_error(error);
    }
}
