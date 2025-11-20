import { McpError, ErrorCode } from '../lib/utils';
import { getReadOnlyClient } from '../lib/clients';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../lib/writeResultToFile';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetTable",
  description: "Retrieve ABAP table structure.",
  inputSchema: {
    table_name: z.string().describe("Name of the ABAP table")
  }
} as const;

function parseTableXml(xml: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
        trimValues: true
    });
    const result = parser.parse(xml);

    // DDIC Table (TABL/DT)
    if (result['ddic:table']) {
        const t = result['ddic:table'];
        const fields = Array.isArray(t['ddic:fields']?.['ddic:field'])
            ? t['ddic:fields']['ddic:field']
            : t['ddic:fields']?.['ddic:field']
            ? [t['ddic:fields']['ddic:field']]
            : [];
        return {
            name: t['adtcore:name'],
            objectType: 'table',
            description: t['adtcore:description'],
            package: t['adtcore:packageRef']?.['adtcore:name'] || null,
            fields: fields.map(f => ({
                name: f['ddic:name'],
                dataType: f['ddic:dataType'],
                length: parseInt(f['ddic:length'], 10),
                decimals: parseInt(f['ddic:decimals'] || '0', 10),
                key: f['ddic:keyFlag'] === 'true',
                description: f['ddic:description']
            }))
        };
    }

    // fallback: return raw
    return { raw: result };
}

export async function handleGetTable(args: any) {
    try {
        if (!args?.table_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
        }
        const response = await getReadOnlyClient().getTable(args.table_name);
    // Parse XML responses; fall back to returning the payload as-is
        if (typeof response.data === 'string' && response.data.trim().startsWith('<?xml')) {
            const resultObj = parseTableXml(response.data);
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
            const plainResult = {
                isError: false,
                content: [
                    {
                        type: "text",
                        text: response.data
                    }
                ]
            };
            if (args.filePath) {
                writeResultToFile(response.data, args.filePath);
            }
            return plainResult;
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
