/**
 * GetInactiveObjects Handler - Retrieve list of inactive ABAP objects
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
    name: "GetInactiveObjects",
    description: "[read-only] Get a list of inactive ABAP objects (objects that have been modified but not activated).",
    inputSchema: {
        type: "object",
        properties: {},
        required: []
    }
} as const;

export async function handleGetInactiveObjects(context: HandlerContext, params: any) {
    const { connection, logger } = context;
    try {
        const client = new CrudClient(connection);

        logger.info("Retrieving inactive objects...");
        const result = await client.getInactiveObjects();

        return return_response({
            data: JSON.stringify({
                success: true,
                count: result.objects.length,
                objects: result.objects
            }, null, 2),
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any
        });

    } catch (error: any) {
        logger.error("Error retrieving inactive objects:", error);
        return return_error(error);
    }
}
