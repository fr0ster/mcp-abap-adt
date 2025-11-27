import { McpError, ErrorCode, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetClass",
  description: "[read-only] Retrieve ABAP class source code.",
  inputSchema: {
    class_name: z.string().describe("Name of the ABAP class")
  }
} as const;

interface GetClassArgs {
  [key: string]: any;
}


function parseClassXml(xml: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
        trimValues: true
    });
    const result = parser.parse(xml);

    // ADT Class XML (CLAS/OC)
    if (result['oo:class']) {
        const c = result['oo:class'];

    // Method implementations extracted from the XML payload
        let methodImpls: any[] = [];
        const implSection = c['oo:methodImplementations']?.['oo:methodImplementation'];
        if (Array.isArray(implSection)) {
            methodImpls = implSection.map(m => ({
                name: m['adtcore:name'],
                source: m['oo:source']
            }));
        } else if (implSection) {
            methodImpls = [{
                name: implSection['adtcore:name'],
                source: implSection['oo:source']
            }];
        }

        return {
            name: c['adtcore:name'],
            objectType: 'class',
            description: c['adtcore:description'],
            package: c['adtcore:packageRef']?.['adtcore:name'] || null,
            superClass: c['oo:superClass']?.['adtcore:name'] || null,
            interfaces: Array.isArray(c['oo:interfaces']?.['oo:interface'])
                ? c['oo:interfaces']['oo:interface'].map(i => i['adtcore:name'])
                : c['oo:interfaces']?.['oo:interface']
                ? [c['oo:interfaces']['oo:interface']['adtcore:name']]
                : [],
            methods: Array.isArray(c['oo:methods']?.['oo:method'])
                ? c['oo:methods']['oo:method'].map(m => m['adtcore:name'])
                : c['oo:methods']?.['oo:method']
                ? [c['oo:methods']['oo:method']['adtcore:name']]
                : [],
            attributes: Array.isArray(c['oo:attributes']?.['oo:attribute'])
                ? c['oo:attributes']['oo:attribute'].map(a => a['adtcore:name'])
                : c['oo:attributes']?.['oo:attribute']
                ? [c['oo:attributes']['oo:attribute']['adtcore:name']]
                : [],
            methodImplementations: methodImpls
        };
    }

    // fallback: return raw
    return { raw: result };
}

export async function handleGetClass(args: GetClassArgs) {
    try {
        if (!args?.class_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Class name is required');
        }
        const connection = getManagedConnection();
        const client = new CrudClient(connection);
        await client.readClass(args.class_name);
        const response = client.getReadResult();
        if (!response) {
            throw new McpError(ErrorCode.InternalError, 'Failed to read class');
        }
    // Parse XML responses; otherwise return the payload unchanged
        if (typeof response.data === 'string' && response.data.trim().startsWith('<?xml')) {
            const resultObj = parseClassXml(response.data);
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
            // Plain text responses still follow the MCP wrapper format
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
