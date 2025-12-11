/**
 * GetInactiveObjects Handler - Retrieve list of inactive ABAP objects
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
    name: "GetInactiveObjects",
    description: "[read-only] Get a list of inactive ABAP objects (objects that have been modified but not activated).",
    inputSchema: {
        type: "object",
        properties: {},
        required: []
    }
} as const;

export async function handleGetInactiveObjects(params: any) {
    const connection = getManagedConnection();
    const handlerLogger = getHandlerLogger(
      'handleGetInactiveObjects',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    try {
        const client = new CrudClient(connection);

        handlerLogger.info("Retrieving inactive objects...");
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
        handlerLogger.error("Error retrieving inactive objects:", error);
        return return_error(error);
    }
}
