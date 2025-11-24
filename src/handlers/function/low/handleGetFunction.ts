import { McpError, ErrorCode, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetFunction",
  description: "Retrieve ABAP Function Module source code.",
  inputSchema: {
    function_name: z.string().describe("Name of the function module"),
    function_group: z.string().describe("Name of the function group")
  }
} as const;

function parseFunctionXml(xml: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
        trimValues: true
    });
    const result = parser.parse(xml);

    // ADT Function Module XML (FUGR/FM)
    if (result['fu:functionModule']) {
    const f = result['fu:functionModule'];
    // Parameter extraction helper
        const params = (section) => {
            const arr = f[section]?.['fu:parameter'];
            if (!arr) return [];
            return Array.isArray(arr)
                ? arr.map(p => ({
                    name: p['fu:name'],
                    type: p['fu:type'],
                    typing: p['fu:typing'],
                    reference: p['fu:reference'],
                    default: p['fu:default'],
                    optional: p['fu:optional'] === 'true',
                    description: p['fu:description']
                }))
                : [{
                    name: arr['fu:name'],
                    type: arr['fu:type'],
                    typing: arr['fu:typing'],
                    reference: arr['fu:reference'],
                    default: arr['fu:default'],
                    optional: arr['fu:optional'] === 'true',
                    description: arr['fu:description']
                }];
        };
    // Table parameters
        const tables = params('fu:tables');
    // Import/export/changing parameter sets
        const importing = params('fu:importing');
        const exporting = params('fu:exporting');
        const changing = params('fu:changing');
    // Exceptions
        const exceptions = f['fu:exceptions']?.['fu:exception'];
        const excArr = !exceptions ? [] : Array.isArray(exceptions)
            ? exceptions.map(e => e['fu:name'])
            : [exceptions['fu:name']];
        // Source code
        const source = f['fu:source'];

        return {
            name: f['adtcore:name'],
            objectType: 'function_module',
            description: f['adtcore:description'],
            group: f['adtcore:parentRef']?.['adtcore:name'] || null,
            importing,
            exporting,
            changing,
            tables,
            exceptions: excArr,
            source
        };
    }

    // fallback: return raw
    return { raw: result };
}

export async function handleGetFunction(args: any) {
    try {
        if (!args?.function_name || !args?.function_group) {
            throw new McpError(ErrorCode.InvalidParams, 'Function name and group are required');
        }
    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    await client.readFunctionModule(args.function_name, args.function_group);
    const response = client.getReadResult();
    if (!response) {
        throw new McpError(ErrorCode.InternalError, 'Failed to read function module');
    }
    // Parse XML responses and return JSON; otherwise stream back the plain text
        if (typeof response.data === 'string' && response.data.trim().startsWith('<?xml')) {
            const resultObj = parseFunctionXml(response.data);
            const result = {
                isError: false,
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(resultObj, null, 2)
                    }
                ]
            };
            if (args.filePath) {
                writeResultToFile(JSON.stringify(result, null, 2), args.filePath);
            }
            return result;
        } else {
            // Wrap plain text responses in the MCP format
            if (args.filePath) {
                writeResultToFile(response.data, args.filePath);
            }
            return {
                isError: false,
                content: [
                    {
                        type: "text",
                        text: response.data
                    }
                ]
            };
        }
    } catch (error) {
        return {
            isError: true,
            content: [
                {
                        type: "text",
                        text: error instanceof Error ? error.message : String(error)
                }
            ]
        };
    }
}
