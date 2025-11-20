/**
 * GetDataElement Handler - Retrieve ABAP Data Element information via ADT API
 *
 * Retrieves complete data element metadata including:
 * - Type definition (domain reference or built-in type)
 * - Field labels (short, medium, long, heading)
 * - Data type characteristics (type, length, decimals)
 * - Search help and parameter information
 * - Package and system information
 */

import { McpError, ErrorCode } from '../lib/utils';
import { return_error, return_response } from '../lib/utils';
import { getReadOnlyClient } from '../lib/clients';
import { XMLParser } from 'fast-xml-parser';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetDataElement",
  description: "Retrieve ABAP data element information including type definition, field labels, and metadata from SAP system via ADT API.",
  inputSchema: {
    data_element_name: z.string().describe("Data element name (e.g., MAKTX, MATNR, ZZ_E_TEST_001)")
  }
} as const;

interface DataElementArgs {
  data_element_name: string;
}

/**
 * Parse data element XML response to structured JSON
 */
function parseDataElementXml(xmlData: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
  });

  const result = parser.parse(xmlData);
  const wbobj = result['blue:wbobj'] || result['wbobj'];

  if (!wbobj) {
    throw new McpError(ErrorCode.InternalError, 'Invalid data element XML structure');
  }

  // Extract core attributes
  const coreAttrs = {
    name: wbobj['adtcore:name'] || wbobj['name'],
    type: wbobj['adtcore:type'] || wbobj['type'],
    description: wbobj['adtcore:description'] || wbobj['description'],
    language: wbobj['adtcore:language'] || wbobj['language'],
    masterLanguage: wbobj['adtcore:masterLanguage'] || wbobj['masterLanguage'],
    masterSystem: wbobj['adtcore:masterSystem'] || wbobj['masterSystem'],
    responsible: wbobj['adtcore:responsible'] || wbobj['responsible'],
    createdAt: wbobj['adtcore:createdAt'] || wbobj['createdAt'],
    createdBy: wbobj['adtcore:createdBy'] || wbobj['createdBy'],
    changedAt: wbobj['adtcore:changedAt'] || wbobj['changedAt'],
    changedBy: wbobj['adtcore:changedBy'] || wbobj['changedBy'],
    version: wbobj['adtcore:version'] || wbobj['version'],
    abapLanguageVersion: wbobj['adtcore:abapLanguageVersion'] || wbobj['abapLanguageVersion']
  };

  // Extract package reference
  const packageRef = wbobj['adtcore:packageRef'] || wbobj['packageRef'];
  const packageInfo = packageRef ? {
    name: packageRef['adtcore:name'] || packageRef['name'],
    type: packageRef['adtcore:type'] || packageRef['type'],
    description: packageRef['adtcore:description'] || packageRef['description'],
    uri: packageRef['adtcore:uri'] || packageRef['uri']
  } : null;

  // Extract data element details
  const dtel = wbobj['dtel:dataElement'] || wbobj['dataElement'];
  const dataElementInfo = dtel ? {
    typeKind: dtel['dtel:typeKind'] || dtel['typeKind'],
    typeName: dtel['dtel:typeName'] || dtel['typeName'],
    dataType: dtel['dtel:dataType'] || dtel['dataType'],
    dataTypeLength: dtel['dtel:dataTypeLength'] || dtel['dataTypeLength'],
    dataTypeDecimals: dtel['dtel:dataTypeDecimals'] || dtel['dataTypeDecimals'],

    // Field labels
    shortFieldLabel: dtel['dtel:shortFieldLabel'] || dtel['shortFieldLabel'],
    shortFieldLength: dtel['dtel:shortFieldLength'] || dtel['shortFieldLength'],
    shortFieldMaxLength: dtel['dtel:shortFieldMaxLength'] || dtel['shortFieldMaxLength'],

    mediumFieldLabel: dtel['dtel:mediumFieldLabel'] || dtel['mediumFieldLabel'],
    mediumFieldLength: dtel['dtel:mediumFieldLength'] || dtel['mediumFieldLength'],
    mediumFieldMaxLength: dtel['dtel:mediumFieldMaxLength'] || dtel['mediumFieldMaxLength'],

    longFieldLabel: dtel['dtel:longFieldLabel'] || dtel['longFieldLabel'],
    longFieldLength: dtel['dtel:longFieldLength'] || dtel['longFieldLength'],
    longFieldMaxLength: dtel['dtel:longFieldMaxLength'] || dtel['longFieldMaxLength'],

    headingFieldLabel: dtel['dtel:headingFieldLabel'] || dtel['headingFieldLabel'],
    headingFieldLength: dtel['dtel:headingFieldLength'] || dtel['headingFieldLength'],
    headingFieldMaxLength: dtel['dtel:headingFieldMaxLength'] || dtel['headingFieldMaxLength'],

    // Additional properties
    searchHelp: dtel['dtel:searchHelp'] || dtel['searchHelp'],
    searchHelpParameter: dtel['dtel:searchHelpParameter'] || dtel['searchHelpParameter'],
    setGetParameter: dtel['dtel:setGetParameter'] || dtel['setGetParameter'],
    defaultComponentName: dtel['dtel:defaultComponentName'] || dtel['defaultComponentName'],
    deactivateInputHistory: dtel['dtel:deactivateInputHistory'] || dtel['deactivateInputHistory'],
    changeDocument: dtel['dtel:changeDocument'] || dtel['changeDocument'],
    leftToRightDirection: dtel['dtel:leftToRightDirection'] || dtel['leftToRightDirection'],
    deactivateBIDIFiltering: dtel['dtel:deactivateBIDIFiltering'] || dtel['deactivateBIDIFiltering']
  } : null;

  return {
    metadata: coreAttrs,
    package: packageInfo,
    dataElement: dataElementInfo
  };
}

/**
 * Main handler for GetDataElement MCP tool
 */
export async function handleGetDataElement(args: any) {
  try {
    // Validate required parameters
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }

    const typedArgs = args as DataElementArgs;
    const response = await getReadOnlyClient().getDataElement(typedArgs.data_element_name);

    // Parse XML to JSON
    const parsedData = parseDataElementXml(response.data);

    return return_response({
      data: JSON.stringify({
        success: true,
        data_element: parsedData,
        raw_xml: response.data
      }, null, 2),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config
    });

  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
