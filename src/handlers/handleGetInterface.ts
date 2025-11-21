import { McpError, ErrorCode, return_response, getManagedConnection } from '../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../lib/writeResultToFile';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetInterface",
  description: "Retrieve ABAP interface source code.",
  inputSchema: {
    interface_name: z.string().describe("Name of the ABAP interface")
  }
} as const;

function parseInterfaceXml(xml: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
        trimValues: true
    });
    const result = parser.parse(xml);

    // ADT Interface XML (INTF/OI)
    if (result['oo:interface']) {
        const i = result['oo:interface'];
        return {
            name: i['adtcore:name'],
            objectType: 'interface',
            description: i['adtcore:description'],
            package: i['adtcore:packageRef']?.['adtcore:name'] || null,
            interfaces: Array.isArray(i['oo:interfaces']?.['oo:interface'])
                ? i['oo:interfaces']['oo:interface'].map(ii => ii['adtcore:name'])
                : i['oo:interfaces']?.['oo:interface']
                ? [i['oo:interfaces']['oo:interface']['adtcore:name']]
                : [],
            methods: Array.isArray(i['oo:methods']?.['oo:method'])
                ? i['oo:methods']['oo:method'].map(m => m['adtcore:name'])
                : i['oo:methods']?.['oo:method']
                ? [i['oo:methods']['oo:method']['adtcore:name']]
                : [],
            attributes: Array.isArray(i['oo:attributes']?.['oo:attribute'])
                ? i['oo:attributes']['oo:attribute'].map(a => a['adtcore:name'])
                : i['oo:attributes']?.['oo:attribute']
                ? [i['oo:attributes']['oo:attribute']['adtcore:name']]
                : []
        };
    }

    // fallback: return raw
    return { raw: result };
}

export async function handleGetInterface(args: any) {
    try {
        if (!args?.interface_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Interface name is required');
        }
        const connection = getManagedConnection();
        const client = new CrudClient(connection);
        await client.readInterface(args.interface_name);
        const response = client.getReadResult();
        if (!response) {
            throw new McpError(ErrorCode.InternalError, 'Failed to read interface');
        }
    // Parse XML responses; otherwise return the payload unchanged
        if (typeof response.data === 'string' && response.data.trim().startsWith('<?xml')) {
            const result = {
                isError: false,
                content: [
                    {
                        type: "json",
                        json: parseInterfaceXml(response.data)
                    }
                ]
            };
            if (args.filePath) {
                writeResultToFile(result, args.filePath);
            }
            return result;
        } else {
            const plainResult = return_response(response);
            if (args.filePath) {
                writeResultToFile(plainResult, args.filePath);
            }
            return plainResult;
        }
    } catch (error) {
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
