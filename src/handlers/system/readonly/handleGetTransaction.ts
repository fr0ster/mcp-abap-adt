import { McpError, ErrorCode, AxiosResponse, logger as baseLogger } from '../../../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, encodeSapObjectName } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';


export const TOOL_DEFINITION = {
  "name": "GetTransaction",
  "description": "[read-only] Retrieve ABAP transaction details.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "transaction_name": {
        "type": "string",
        "description": "Name of the ABAP transaction"
      }
    },
    "required": [
      "transaction_name"
    ]
  }
} as const;

function parseTransactionXml(xml: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
        trimValues: true
    });
    const result = parser.parse(xml);

    // ADT Transaction XML (opr:objectProperties)
    if (result['opr:objectProperties'] && result['opr:objectProperties']['opr:object']) {
        const obj = result['opr:objectProperties']['opr:object'];
        return {
            name: obj['name'],
            objectType: 'transaction',
            description: obj['text'],
            package: obj['package'],
            type: obj['type']
        };
    }

    // fallback: return raw
    return { raw: result };
}

export async function handleGetTransaction(args: any) {
    const handlerLogger = getHandlerLogger(
      'handleGetTransaction',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
    try {
        if (!args?.transaction_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Transaction name is required');
        }
        handlerLogger.info(`Fetching transaction info for ${args.transaction_name}`);
        const encodedTransactionName = encodeSapObjectName(args.transaction_name);
        const url = `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=%2Fsap%2Fbc%2Fadt%2Fvit%2Fwb%2Fobject_type%2Ftrant%2Fobject_name%2F${encodedTransactionName}&facet=package&facet=appl`;
    const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
    // Parse XML responses; otherwise return the payload unchanged
        if (typeof response.data === 'string' && response.data.trim().startsWith('<?xml')) {
            const result = {
                isError: false,
                content: [
                    {
                        type: "json",
                        json: parseTransactionXml(response.data)
                    }
                ]
            };
            if (args.filePath) {
                handlerLogger.debug(`Writing transaction result to file: ${args.filePath}`);
                writeResultToFile(result, args.filePath);
            }
            return result;
        } else {
            const plainResult = return_response(response);
            if (args.filePath) {
                handlerLogger.debug(`Writing transaction payload to file: ${args.filePath}`);
                writeResultToFile(plainResult, args.filePath);
            }
            return plainResult;
        }
    } catch (error) {
        handlerLogger.error(`Failed to fetch transaction ${args?.transaction_name}`, error as any);
        // MCP-compliant error response: always return content[] with type "text"
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `ADT error: ${String(error)}`
                }
            ]
        };
    }
}
