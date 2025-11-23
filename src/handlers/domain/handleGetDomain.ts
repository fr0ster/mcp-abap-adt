import { McpError, ErrorCode, getManagedConnection } from '../../lib/utils';
import { return_error, return_response } from '../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetDomain",
  description: "Retrieve ABAP domain structure and properties from SAP system.",
  inputSchema: {
    domain_name: z.string().describe("Domain name (e.g., MATNR, CHAR20, ZZ_TEST_DOMAIN)")
  }
} as const;

interface DomainArgs {
  domain_name: string;
}

/**
 * Main handler for GetDomain MCP tool
 */
export async function handleGetDomain(args: any) {
  try {
    // Validate required parameters
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }

    const typedArgs = args as DomainArgs;
    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    await client.readDomain(typedArgs.domain_name);
    const response = client.getReadResult();
    if (!response) {
      throw new McpError(ErrorCode.InternalError, 'Failed to read domain');
    }

    // Parse XML response
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });

    const result = parser.parse(response.data);
    const domain = result['doma:domain'];

    if (!domain) {
      throw new McpError(ErrorCode.InternalError, 'Failed to parse domain XML response');
    }

    // Extract domain information
    const domainInfo = {
      name: domain['adtcore:name'],
      type: domain['adtcore:type'],
      description: domain['adtcore:description'] || '',
      language: domain['adtcore:language'],
      masterLanguage: domain['adtcore:masterLanguage'],
      masterSystem: domain['adtcore:masterSystem'],
      responsible: domain['adtcore:responsible'],
      createdBy: domain['adtcore:createdBy'],
      createdAt: domain['adtcore:createdAt'],
      changedBy: domain['adtcore:changedBy'],
      changedAt: domain['adtcore:changedAt'],
      version: domain['adtcore:version'],
      abapLanguageVersion: domain['adtcore:abapLanguageVersion'],
      package: {
        name: domain['adtcore:packageRef']?.['adtcore:name'],
        type: domain['adtcore:packageRef']?.['adtcore:type'],
        description: domain['adtcore:packageRef']?.['adtcore:description'],
        uri: domain['adtcore:packageRef']?.['adtcore:uri']
      },
      content: domain['doma:content'] ? {
        typeInformation: {
          datatype: domain['doma:content']['doma:typeInformation']?.['doma:datatype'],
          length: domain['doma:content']['doma:typeInformation']?.['doma:length'],
          decimals: domain['doma:content']['doma:typeInformation']?.['doma:decimals']
        },
        outputInformation: {
          length: domain['doma:content']['doma:outputInformation']?.['doma:length'],
          style: domain['doma:content']['doma:outputInformation']?.['doma:style'],
          conversionExit: domain['doma:content']['doma:outputInformation']?.['doma:conversionExit'] || '',
          signExists: domain['doma:content']['doma:outputInformation']?.['doma:signExists'],
          lowercase: domain['doma:content']['doma:outputInformation']?.['doma:lowercase'],
          ampmFormat: domain['doma:content']['doma:outputInformation']?.['doma:ampmFormat']
        },
        valueInformation: {
          valueTableRef: domain['doma:content']['doma:valueInformation']?.['doma:valueTableRef'] || '',
          appendExists: domain['doma:content']['doma:valueInformation']?.['doma:appendExists'],
          fixValues: domain['doma:content']['doma:valueInformation']?.['doma:fixValues']
        }
      } : null
    };

    return return_response({
      data: JSON.stringify({
        success: true,
        domain: domainInfo,
        raw_xml: response.data
      }, null, 2),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config
    });

  } catch (error) {
    console.error('[GetDomain] Error:', error);

    if (error instanceof McpError) {
      throw error;
    }

    return return_error(error);
  }
}
