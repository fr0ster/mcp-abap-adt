import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl } from '../lib/utils';

export async function handleGetFunctionGroup(args: any) {
    try {
        if (!args?.function_group) {
            throw new McpError(ErrorCode.InvalidParams, 'Function Group is required');
        }
        const url = `${await getBaseUrl()}/sap/bc/adt/functions/groups/${args.function_group}/source/main`;
        const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
        return return_response(response);
    } catch (error) {
        return return_error(error);
    }
}
