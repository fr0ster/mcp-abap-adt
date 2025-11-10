import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, makeAdtRequestWithTimeout, getBaseUrl } from '../lib/utils';
import { makeAdtRequestWithSession, generateSessionId } from '../lib/sessionUtils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "UpdateDataElement",
  description: `Update an existing ABAP data element in SAP system.

Workflow:
1. Gets domain info (if type_kind is 'domain') to extract dataType/length/decimals
2. Acquires lock on the data element
3. Updates data element with provided parameters (complete replacement)
4. Unlocks data element
5. Optionally activates data element (default: true)
6. Returns updated data element details

Supported type_kind values:
- domain: Based on ABAP domain (requires type_name = domain name)
- predefinedAbapType: Direct ABAP type (requires data_type, length, decimals)
- refToPredefinedAbapType: Reference to ABAP type (requires data_type, length, decimals)
- refToDictionaryType: Reference to another data element (requires type_name = data element name)
- refToClifType: Reference to class (requires type_name = class name)

Note: All provided parameters completely replace existing values. Field labels are truncated to max lengths (10/20/40/55).`,
  inputSchema: {
    type: "object",
    properties: {
      data_element_name: {
        type: "string",
        description: "Data element name to update (e.g., ZZ_TEST_DTEL_01)"
      },
      description: {
        type: "string",
        description: "New data element description"
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      type_kind: {
        type: "string",
        description: "Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType",
        enum: ["domain", "predefinedAbapType", "refToPredefinedAbapType", "refToDictionaryType", "refToClifType"],
        default: "domain"
      },
      type_name: {
        type: "string",
        description: "Type name: domain name, data element name, or class name (depending on type_kind)"
      },
      data_type: {
        type: "string",
        description: "Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType"
      },
      length: {
        type: "number",
        description: "Length - for predefinedAbapType or refToPredefinedAbapType"
      },
      decimals: {
        type: "number",
        description: "Decimals - for predefinedAbapType or refToPredefinedAbapType"
      },
      domain_name: {
        type: "string",
        description: "Domain name (deprecated - use type_name with type_kind=domain)"
      },
      field_label_short: {
        type: "string",
        description: "Short field label (max 10 chars)"
      },
      field_label_medium: {
        type: "string",
        description: "Medium field label (max 20 chars)"
      },
      field_label_long: {
        type: "string",
        description: "Long field label (max 40 chars)"
      },
      field_label_heading: {
        type: "string",
        description: "Heading field label (max 55 chars)"
      },
      search_help: {
        type: "string",
        description: "Search help name"
      },
      search_help_parameter: {
        type: "string",
        description: "Search help parameter"
      },
      set_get_parameter: {
        type: "string",
        description: "Set/Get parameter ID"
      },
      default_component_name: {
        type: "string",
        description: "Default component name"
      },
      deactivate_input_history: {
        type: "boolean",
        description: "Deactivate input history",
        default: false
      },
      change_document: {
        type: "boolean",
        description: "Change document",
        default: false
      },
      left_to_right_direction: {
        type: "boolean",
        description: "Left to right direction",
        default: false
      },
      deactivate_bidi_filtering: {
        type: "boolean",
        description: "Deactivate BiDi filtering",
        default: false
      },
      activate: {
        type: "boolean",
        description: "Activate data element after update (default: true)",
        default: true
      }
    },
    required: ["data_element_name", "package_name"]
  }
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  type_kind?: string;
  type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  domain_name?: string; // deprecated
  field_label_short?: string;
  field_label_medium?: string;
  field_label_long?: string;
  field_label_heading?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
  default_component_name?: string;
  deactivate_input_history?: boolean;
  change_document?: boolean;
  left_to_right_direction?: boolean;
  deactivate_bidi_filtering?: boolean;
  activate?: boolean;
}

/**
 * Step 1: Get domain info to extract dataType, length, decimals
 */
async function getDomainInfo(domainName: string): Promise<{ dataType: string; length: number; decimals: number }> {
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `${await getBaseUrl()}/sap/bc/adt/ddic/domains/${domainNameEncoded}`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml'
  };
  
  const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);
  
  // Parse XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  
  const result = parser.parse(response.data);
  const domainXml = result['doma:domain'];
  
  return {
    dataType: domainXml['doma:content']?.['doma:typeInformation']?.['doma:datatype'] || 'CHAR',
    length: domainXml['doma:content']?.['doma:typeInformation']?.['doma:length'] || 100,
    decimals: domainXml['doma:content']?.['doma:typeInformation']?.['doma:decimals'] || 0
  };
}

/**
 * Step 2: Acquire lock handle
 */
async function acquireLockHandle(
  dataElementName: string,
  sessionId: string
): Promise<string> {
  const dataElementNameEncoded = encodeSapObjectName(dataElementName.toLowerCase());
  const url = `/sap/bc/adt/ddic/dataelements/${dataElementNameEncoded}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  try {
    const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
    
    // Parse XML response to extract LOCK_HANDLE
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ''
    });
    
    const result = parser.parse(response.data);
    const lockHandle = result['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
    
    if (!lockHandle) {
      throw new McpError(
        ErrorCode.InternalError,
        'Failed to extract lock handle from response'
      );
    }
    
    return lockHandle;
  } catch (error: any) {
    // Handle specific error cases
    if (error.response?.status === 403) {
      throw new McpError(
        ErrorCode.InternalError,
        `Data element ${dataElementName} is locked by another user or session. Please try again later.`
      );
    }
    
    if (error.response?.status === 404) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Data element ${dataElementName} not found.`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to lock data element ${dataElementName}: ${error.message || error}`
    );
  }
}

/**
 * Step 3: Update data element
 * Build complete XML from parameters
 */
async function updateDataElement(
  args: DataElementArgs,
  lockHandle: string,
  sessionId: string,
  username: string,
  domainInfo: { dataType: string; length: number; decimals: number }
): Promise<AxiosResponse> {
  const dataElementNameEncoded = encodeSapObjectName(args.data_element_name.toLowerCase());
  
  // For $TMP package, don't include corrNr parameter
  const corrNrParam = args.transport_request ? `&corrNr=${args.transport_request}` : '';
  const url = `/sap/bc/adt/ddic/dataelements/${dataElementNameEncoded}?lockHandle=${lockHandle}${corrNrParam}`;
  
  // Build data element XML from parameters
  const typeKind = args.type_kind || 'domain';
  const typeName = args.type_name || args.domain_name || '';
  
  // Determine dataType, length, decimals based on typeKind
  let dataType = '';
  let dataTypeLength = 0;
  let dataTypeDecimals = 0;
  
  if (typeKind === 'domain') {
    // For domain - get from domain info
    dataType = domainInfo.dataType;
    dataTypeLength = domainInfo.length;
    dataTypeDecimals = domainInfo.decimals;
  } else if (typeKind === 'predefinedAbapType' || typeKind === 'refToPredefinedAbapType') {
    // For ABAP types - use provided values
    dataType = args.data_type || 'CHAR';
    dataTypeLength = args.length || 100;
    dataTypeDecimals = args.decimals || 0;
  } else {
    // For refToDictionaryType or refToClifType - empty values
    dataType = '';
    dataTypeLength = 0;
    dataTypeDecimals = 0;
  }
  
  // Max lengths - defaults
  const shortMaxLength = 10;
  const mediumMaxLength = 20;
  const longMaxLength = 40;
  const headingMaxLength = 55;
  
  // Labels - truncate if longer than max
  const shortLabel = (args.field_label_short || '').substring(0, shortMaxLength);
  const mediumLabel = (args.field_label_medium || '').substring(0, mediumMaxLength);
  const longLabel = (args.field_label_long || '').substring(0, longMaxLength);
  const headingLabel = (args.field_label_heading || '').substring(0, headingMaxLength);
  
  // Actual lengths - calculated from label length, or max if empty
  const shortLength = shortLabel.length || shortMaxLength;
  const mediumLength = mediumLabel.length || mediumMaxLength;
  const longLength = longLabel.length || longMaxLength;
  const headingLength = headingLabel.length || headingMaxLength;
  
  // Build complete XML manually
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" 
            xmlns:adtcore="http://www.sap.com/adt/core" 
            xmlns:atom="http://www.w3.org/2005/Atom" 
            xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" 
            adtcore:description="${args.description || args.data_element_name}" 
            adtcore:language="EN" 
            adtcore:name="${args.data_element_name.toUpperCase()}" 
            adtcore:type="DTEL/DE" 
            adtcore:masterLanguage="EN" 
            adtcore:responsible="${username}">
  <adtcore:packageRef adtcore:name="${args.package_name.toUpperCase()}"/>
  <dtel:dataElement>
    <dtel:typeKind>${typeKind}</dtel:typeKind>
    <dtel:typeName>${typeName.toUpperCase()}</dtel:typeName>
    <dtel:dataType>${dataType}</dtel:dataType>
    <dtel:dataTypeLength>${dataTypeLength}</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>${dataTypeDecimals}</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel>${shortLabel}</dtel:shortFieldLabel>
    <dtel:shortFieldLength>${shortLength}</dtel:shortFieldLength>
    <dtel:shortFieldMaxLength>${shortMaxLength}</dtel:shortFieldMaxLength>
    <dtel:mediumFieldLabel>${mediumLabel}</dtel:mediumFieldLabel>
    <dtel:mediumFieldLength>${mediumLength}</dtel:mediumFieldLength>
    <dtel:mediumFieldMaxLength>${mediumMaxLength}</dtel:mediumFieldMaxLength>
    <dtel:longFieldLabel>${longLabel}</dtel:longFieldLabel>
    <dtel:longFieldLength>${longLength}</dtel:longFieldLength>
    <dtel:longFieldMaxLength>${longMaxLength}</dtel:longFieldMaxLength>
    <dtel:headingFieldLabel>${headingLabel}</dtel:headingFieldLabel>
    <dtel:headingFieldLength>${headingLength}</dtel:headingFieldLength>
    <dtel:headingFieldMaxLength>${headingMaxLength}</dtel:headingFieldMaxLength>
    <dtel:searchHelp>${args.search_help || ''}</dtel:searchHelp>
    <dtel:searchHelpParameter>${args.search_help_parameter || ''}</dtel:searchHelpParameter>
    <dtel:setGetParameter>${args.set_get_parameter || ''}</dtel:setGetParameter>
    <dtel:defaultComponentName>${args.default_component_name || ''}</dtel:defaultComponentName>
    <dtel:deactivateInputHistory>${args.deactivate_input_history || false}</dtel:deactivateInputHistory>
    <dtel:changeDocument>${args.change_document || false}</dtel:changeDocument>
    <dtel:leftToRightDirection>${args.left_to_right_direction || false}</dtel:leftToRightDirection>
    <dtel:deactivateBIDIFiltering>${args.deactivate_bidi_filtering || false}</dtel:deactivateBIDIFiltering>
  </dtel:dataElement>
</blue:wbobj>`;
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8'
  };
  
  const response = await makeAdtRequestWithSession(url, 'PUT', sessionId, xmlBody, headers);
  return response;
}

/**
 * Step 3: Unlock data element
 */
async function unlockDataElement(
  dataElementName: string,
  lockHandle: string,
  sessionId: string
): Promise<AxiosResponse> {
  const dataElementNameEncoded = encodeSapObjectName(dataElementName.toLowerCase());
  const url = `/sap/bc/adt/ddic/dataelements/${dataElementNameEncoded}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  return makeAdtRequestWithSession(url, 'POST', sessionId);
}

/**
 * Step 4: Activate data element
 */
async function activateDataElement(dataElementName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/dataelements/${encodeSapObjectName(dataElementName.toLowerCase())}" 
                           adtcore:name="${dataElementName.toUpperCase()}"/>
</adtcore:objectReferences>`;
  
  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, xmlBody, headers);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  
  const result = parser.parse(response.data);
  const inactive = result['adtcore:objectReferences']?.['adtcore:objectReference']?.['adtcore:inactive'];
  
  if (inactive === 'true' || inactive === true) {
    throw new McpError(ErrorCode.InternalError, 'Data element activation failed');
  }
  
  return response;
}

/**
 * Step 5: Get data element to verify update
 */
async function getDataElementForVerification(dataElementName: string, sessionId: string): Promise<any> {
  const dataElementNameEncoded = encodeSapObjectName(dataElementName.toLowerCase());
  const url = `/sap/bc/adt/ddic/dataelements/${dataElementNameEncoded}?version=active`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'GET', sessionId, undefined, headers);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  
  const result = parser.parse(response.data);
  return result['blue:wbobj'];
}

/**
 * Main handler for UpdateDataElement tool
 */
export async function handleUpdateDataElement(args: any) {
  try {
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    
    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    // Generate session ID for this MCP call
    const sessionId = generateSessionId();
    
    const typedArgs = args as DataElementArgs;
    let lockHandle = '';

    try {
      // Get username from environment or use default
      const username = process.env.SAP_USER || 'MPCUSER';
      
      // Step 1: Get domain info (only if typeKind is domain)
      const typeKind = typedArgs.type_kind || 'domain';
      let domainInfo = { dataType: 'CHAR', length: 100, decimals: 0 };
      
      if (typeKind === 'domain') {
        const domainName = typedArgs.type_name || typedArgs.domain_name || 'CHAR100';
        domainInfo = await getDomainInfo(domainName);
      }
      
      // Step 2: Acquire lock handle (creates stateful session)
      lockHandle = await acquireLockHandle(typedArgs.data_element_name, sessionId);
      
      // Wait for lock to be processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Update data element with new data
      await updateDataElement(typedArgs, lockHandle, sessionId, username, domainInfo);
      
      // Step 3: Unlock data element
      await unlockDataElement(typedArgs.data_element_name, lockHandle, sessionId);
      
      // Step 4: Activate data element (optional, default true)
      const shouldActivate = typedArgs.activate !== false;
      if (shouldActivate) {
        await activateDataElement(typedArgs.data_element_name, sessionId);
      }
      
      // Step 5: Get updated data element for verification
      const updatedDataElement = await getDataElementForVerification(typedArgs.data_element_name, sessionId);
      
      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: typedArgs.data_element_name,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          domain_name: typedArgs.domain_name,
          status: shouldActivate ? 'active' : 'inactive',
          session_id: sessionId,
          message: `Data element ${typedArgs.data_element_name} updated${shouldActivate ? ' and activated' : ''} successfully`,
          data_element_details: updatedDataElement
        })
      } as AxiosResponse);

    } catch (error: any) {
      // Try to unlock if we have a lock handle
      if (lockHandle) {
        try {
          await unlockDataElement(typedArgs.data_element_name, lockHandle, sessionId);
        } catch (unlockError) {
          console.error('Failed to unlock data element after error:', unlockError);
        }
      }
      throw error;
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
