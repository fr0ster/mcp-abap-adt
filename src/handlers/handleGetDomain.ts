import { McpError, ErrorCode } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "GetDomain",
  description: "Retrieve ABAP domain structure and properties from SAP system.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: { 
        type: "string", 
        description: "Domain name (e.g., MATNR, CHAR20, ZZ_TEST_DOMAIN)" 
      }
    },
    required: ["domain_name"]
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
    const baseUrl = await getBaseUrl();
    const domainNameEncoded = encodeSapObjectName(typedArgs.domain_name.toLowerCase());
    
    const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}`;
    
    const headers = {
      'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml'
    };
    
    console.log(`[GetDomain] Retrieving domain: ${typedArgs.domain_name}`);
    console.log(`[GetDomain] URL: ${url}`);
    
    const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);
    
    console.log(`[GetDomain] Response status: ${response.status}`);
    
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
    
    console.log(`[GetDomain] Domain retrieved successfully: ${domainInfo.name}`);
    console.log(`[GetDomain] Datatype: ${domainInfo.content?.typeInformation?.datatype}, Length: ${domainInfo.content?.typeInformation?.length}`);
    
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
