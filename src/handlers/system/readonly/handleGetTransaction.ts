// import { McpError, ErrorCode } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
// import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
export const TOOL_DEFINITION = {
  name: 'GetTransaction',
  description: '[read-only] Retrieve ABAP transaction details.',
  inputSchema: {
    type: 'object',
    properties: {
      transaction_name: {
        type: 'string',
        description: 'Name of the ABAP transaction',
      },
    },
    required: ['transaction_name'],
  },
} as const;

function _parseTransactionXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true,
  });
  const result = parser.parse(xml);

  // ADT Transaction XML (opr:objectProperties)
  if (result['opr:objectProperties']?.['opr:object']) {
    const obj = result['opr:objectProperties']['opr:object'];
    return {
      name: obj.name,
      objectType: 'transaction',
      description: obj.text,
      package: obj.package,
      type: obj.type,
    };
  }

  // fallback: return raw
  return { raw: result };
}

export async function handleGetTransaction(
  context: HandlerContext,
  _args: any,
) {
  const { connection, logger } = context;
  // try {
  //     if (!args?.transaction_name) {
  //         throw new McpError(ErrorCode.InvalidParams, 'Transaction name is required');
  //     }
  //     logger?.info(`Fetching transaction info for ${args.transaction_name}`);
  //     const client = new ReadOnlyClient(connection);
  //     const result = await client.readTransaction(args.transaction_name);
  //     return result;
  // } catch (error) {
  //     logger?.error(`Failed to fetch transaction ${args?.transaction_name}`, error as any);
  //     // MCP-compliant error response: always return content[] with type "text"
  //     return {
  //         isError: true,
  //         content: [
  //             {
  //                 type: "text",
  //                 text: `ADT error: ${String(error)}`
  //             }
  //         ]
  //     };
  // }
  return {
    isError: false,
    content: [{ type: 'json', json: { message: 'Not implemented' } }],
  };
}
