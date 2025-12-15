import { McpError, ErrorCode } from '../../../lib/utils';
import { makeAdtRequestWithTimeout, encodeSapObjectName } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  "name": "GetTypeInfo",
  "description": "[read-only] Retrieve ABAP type information.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type_name": {
        "type": "string",
        "description": "Name of the ABAP type"
      }
    },
    "required": [
      "type_name"
    ]
  }
} as const;

function parseTypeInfoXml(xml: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        parseAttributeValue: true,
        trimValues: true
    });
    const result = parser.parse(xml);

    // Data Element (DTEL/DE)
    if (result['blue:wbobj'] && result['blue:wbobj']['dtel:dataElement']) {
        const wb = result['blue:wbobj'];
        const dtel = wb['dtel:dataElement'];
        return {
            name: wb['adtcore:name'],
            objectType: 'data_element',
            description: wb['adtcore:description'],
            dataType: dtel['dtel:dataType'],
            length: parseInt(dtel['dtel:dataTypeLength'], 10),
            decimals: parseInt(dtel['dtel:dataTypeDecimals'], 10),
            domain: dtel['dtel:typeName'],
            package: wb['adtcore:packageRef']?.['adtcore:name'] || null,
            labels: {
                short: dtel['dtel:shortFieldLabel'],
                medium: dtel['dtel:mediumFieldLabel'],
                long: dtel['dtel:longFieldLabel'],
                heading: dtel['dtel:headingFieldLabel']
            }
        };
    }

    // Domain (DOMA/DD) via repository informationsystem
    if (result['opr:objectProperties'] && result['opr:objectProperties']['opr:object']) {
        const obj = result['opr:objectProperties']['opr:object'];
        return {
            name: obj['name'],
            objectType: 'domain',
            description: obj['text'],
            package: obj['package'],
            type: obj['type'],
        };
    }

    // Table Type (not implemented, fallback)
    return { raw: result };
}

export async function handleGetTypeInfo(context: HandlerContext, args: any) {
  const { connection, logger } = context;
    try {
        if (!args?.type_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Type name is required');
        }
    } catch (error) {
        logger.error('Invalid parameters for GetTypeInfo', error as any);
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

    try {
        logger.info(`Fetching domain info for type ${args.type_name}`);
        const url = `/sap/bc/adt/ddic/domains/${encodeSapObjectName(args.type_name)}/source/main`;
        const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
        const result = {
            isError: false,
            content: [
                {
                    type: "json",
                    json: parseTypeInfoXml(response.data)
                }
            ]
        };
        objectsListCache.setCache(result);
        return result;
    } catch (error) {
        // no domain found, try data element
        try {
            logger.debug(`Domain lookup failed for ${args.type_name}, trying data element`);
            const url = `/sap/bc/adt/ddic/dataelements/${encodeSapObjectName(args.type_name)}`;
            const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
            const result = {
                isError: false,
                content: [
                    {
                        type: "json",
                        json: parseTypeInfoXml(response.data)
                    }
                ]
            };
            objectsListCache.setCache(result);
            return result;
        } catch (error) {
            // no data element found, try table type
            try {
                logger.debug(`Data element lookup failed for ${args.type_name}, trying table type`);
                const url = `/sap/bc/adt/ddic/tabletypes/${encodeSapObjectName(args.type_name)}`;
                const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
                const result = {
                    isError: false,
                    content: [
                        {
                            type: "json",
                            json: parseTypeInfoXml(response.data)
                        }
                    ]
                };
                objectsListCache.setCache(result);
                return result;
            } catch (error) {
                // fallback: try repository informationsystem for domain
                try {
                    logger.debug(`Table type lookup failed for ${args.type_name}, trying repository information system`);
                    const uri = encodeURIComponent(`/sap/bc/adt/ddic/domains/${args.type_name.toLowerCase()}`);
                    const url = `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${uri}`;
                    const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
                        const result = {
                            isError: false,
                            content: [
                                {
                                    type: "json",
                                    json: parseTypeInfoXml(response.data)
                                }
                            ]
                        };
                        objectsListCache.setCache(result);
                        return result;
                } catch (error) {
                    logger.error(`Failed to resolve type info for ${args.type_name}`, error as any);
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
        }
    }
}
