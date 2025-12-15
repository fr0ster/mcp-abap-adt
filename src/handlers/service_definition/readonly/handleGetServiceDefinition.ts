import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { McpError, ErrorCode, return_error, return_response, AxiosResponse } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "GetServiceDefinition",
  description: "[read-only] Retrieve ABAP CDS Service Definition metadata and source code.",
  inputSchema: {
    service_definition_name: z.string().describe("Name of the ABAP CDS Service Definition")
  }
} as const;

function parseServiceDefinitionXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  });
  const result = parser.parse(xml);

  // ADT Service Definition XML (SRVD/SRVD)
  if (result['srvd:srvdSource'] || result['srvdSource']) {
    const srvd = result['srvd:srvdSource'] || result['srvdSource'];
    const packageRef = srvd['adtcore:packageRef'] || srvd['packageRef'];

    return {
      name: srvd['adtcore:name'] || srvd['name'],
      objectType: 'service_definition',
      description: srvd['adtcore:description'] || srvd['description'] || '',
      package: packageRef?.['adtcore:name'] || packageRef?.['name'] || null,
      uri: srvd['adtcore:uri'] || srvd['uri'] || null,
      version: srvd['adtcore:version'] || srvd['version'] || null,
      language: srvd['adtcore:language'] || srvd['language'] || null,
      masterLanguage: srvd['adtcore:masterLanguage'] || srvd['masterLanguage'] || null,
      masterSystem: srvd['adtcore:masterSystem'] || srvd['masterSystem'] || null,
      responsible: srvd['adtcore:responsible'] || srvd['responsible'] || null,
      createdBy: srvd['adtcore:createdBy'] || srvd['createdBy'] || null,
      createdAt: srvd['adtcore:createdAt'] || srvd['createdAt'] || null,
      changedBy: srvd['adtcore:changedBy'] || srvd['changedBy'] || null,
      changedAt: srvd['adtcore:changedAt'] || srvd['changedAt'] || null
    };
  }

  // fallback: return raw
  return { raw: result };
}

export async function handleGetServiceDefinition(context: HandlerContext, args: any): Promise<{ isError: boolean; content: Array<{ type: string; text?: string; json?: any }> }> {
  const { connection, logger } = context;
  try {
    if (!args?.service_definition_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Service definition name is required');
    }
    const client = new ReadOnlyClient(connection);
    const response =  await client.readServiceDefinition(args.service_definition_name);

    if (!response) {
      throw new McpError(ErrorCode.InternalError, 'Failed to read service definition');
    }

    logger.info(`Read service definition ${args.service_definition_name.toUpperCase()}`);

    // Parse XML responses; otherwise return the payload unchanged
    return return_response({
      data: JSON.stringify(response, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });
  } catch (error) {
    logger.error(`Error reading service definition ${args?.service_definition_name || ''}: ${error instanceof Error ? error.message : String(error)}`);
    return return_error(new Error(`Error reading service definition ${args?.service_definition_name || ''}: ${error instanceof Error ? error.message : String(error)}`));
  }
}
