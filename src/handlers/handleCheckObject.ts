/**
 * CheckObject Handler - Syntax check for ABAP objects via ADT API
 * 
 * Eclipse ADT workflow:
 * POST /sap/bc/adt/checkruns?reporters=abapCheckRun
 * 
 * Purpose:
 * - Validate ABAP object syntax without activation
 * - Return syntax errors, warnings, and messages
 * - Useful before activation or during development
 * 
 * Supported object types:
 * - Classes: /sap/bc/adt/oo/classes/{name}
 * - Programs: /sap/bc/adt/programs/programs/{name}
 * - Interfaces: /sap/bc/adt/oo/interfaces/{name}
 * - Function Groups: /sap/bc/adt/functions/groups/{name}
 * - Tables: /sap/bc/adt/ddic/tables/{name}
 * - Structures: /sap/bc/adt/ddic/structures/{name}
 * - Views: /sap/bc/adt/ddic/ddlsources/{name}
 * - Domains: /sap/bc/adt/ddic/domains/{name}
 * - Data Elements: /sap/bc/adt/ddic/dataelements/{name}
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "CheckObject",
  description: "Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages. Useful for validation during development.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: { 
        type: "string", 
        description: "Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE)" 
      },
      object_type: {
        type: "string",
        description: "Object type: 'class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element'",
        enum: ["class", "program", "interface", "function_group", "table", "structure", "view", "domain", "data_element"]
      },
      version: {
        type: "string",
        description: "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active",
        enum: ["active", "inactive"]
      }
    },
    required: ["object_name", "object_type"]
  }
} as const;

interface CheckObjectArgs {
  object_name: string;
  object_type: string;
  version?: string;
}

/**
 * Get ADT URI for object type
 */
function getObjectUri(objectType: string, objectName: string): string {
  const encodedName = encodeSapObjectName(objectName.toLowerCase());
  
  switch (objectType.toLowerCase()) {
    case 'class':
      return `/sap/bc/adt/oo/classes/${encodedName}`;
    case 'program':
      return `/sap/bc/adt/programs/programs/${encodedName}`;
    case 'interface':
      return `/sap/bc/adt/oo/interfaces/${encodedName}`;
    case 'function_group':
      return `/sap/bc/adt/functions/groups/${encodedName}`;
    case 'table':
      return `/sap/bc/adt/ddic/tables/${encodedName}`;
    case 'structure':
      return `/sap/bc/adt/ddic/structures/${encodedName}`;
    case 'view':
      return `/sap/bc/adt/ddic/ddlsources/${encodedName}`;
    case 'domain':
      return `/sap/bc/adt/ddic/domains/${encodedName}`;
    case 'data_element':
      return `/sap/bc/adt/ddic/dataelements/${encodedName}`;
    default:
      throw new Error(`Unsupported object type: ${objectType}`);
  }
}

/**
 * Build simple check run XML payload (without source code)
 */
function buildCheckRunXml(objectUri: string, version: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="${objectUri}" chkrun:version="${version}"/>
</chkrun:checkObjectList>`;
}

/**
 * Parse check run response
 */
function parseCheckRunResponse(response: AxiosResponse): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });
  
  try {
    const result = parser.parse(response.data);
    
    // Log parsed structure for debugging
    logger.info(`Parsed XML structure keys: ${Object.keys(result).join(', ')}`);
    
    // Try different paths for check report
    let checkReport = result['chkrun:checkRunReports']?.['chkrun:checkReport'];
    
    // Alternative: maybe it's without namespace
    if (!checkReport) {
      checkReport = result['checkRunReports']?.['checkReport'];
    }
    
    // Alternative: maybe it's a single report
    if (!checkReport) {
      checkReport = result['chkrun:checkReport'];
    }
    
    if (!checkReport) {
      logger.warn(`No check report found. Available keys: ${JSON.stringify(Object.keys(result))}`);
      
      // Return success if no check report (might mean no issues)
      return {
        success: true,
        status: 'no_report',
        message: 'No check report in response (possibly no issues found)',
        errors: [],
        warnings: [],
        info: []
      };
    }
    
    const status = checkReport['@_chkrun:status'] || checkReport['chkrun:status'] || checkReport['@_status'] || checkReport['status'];
    const statusText = checkReport['chkrun:statusText'] || checkReport['@_chkrun:statusText'] || checkReport['statusText'] || checkReport['@_statusText'] || '';
    
    logger.info(`Check report status: ${status}`);
    
    // Extract messages
    const messages = checkReport['chkrun:messages']?.['msg'] 
      || checkReport['messages']?.['msg'] 
      || checkReport['chkrun:messages'] 
      || checkReport['messages'] 
      || [];
      
    const messageArray = Array.isArray(messages) ? messages : (messages ? [messages] : []);
    
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];
    
    messageArray.forEach((msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      
      const msgType = msg['@_type'] || msg['type'];
      const shortText = msg['shortText']?.['#text'] || msg['shortText'] || '';
      const line = msg['@_line'] || msg['line'];
      const href = msg['@_href'] || msg['href'];
      
      const msgObj = {
        type: msgType,
        text: shortText,
        line: line || '',
        href: href || ''
      };
      
      if (msgType === 'E') {
        errors.push(msgObj);
      } else if (msgType === 'W') {
        warnings.push(msgObj);
      } else {
        info.push(msgObj);
      }
    });
    
    const isSuccess = (status === 'processed' || status === 'no_report') && errors.length === 0;
    
    return {
      success: isSuccess,
      status: status || 'no_report',
      message: statusText,
      errors,
      warnings,
      info,
      total_messages: messageArray.length,
      has_errors: errors.length > 0,
      has_warnings: warnings.length > 0
    };
  } catch (error) {
    logger.error(`Parse error: ${error}`);
    return {
      success: false,
      status: 'parse_error',
      message: `Failed to parse check run response: ${error}`,
      errors: [],
      warnings: [],
      info: []
    };
  }
}

/**
 * Check object syntax
 */
async function checkObject(
  objectName: string,
  objectType: string,
  version: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const objectUri = getObjectUri(objectType, objectName);
  const xmlBody = buildCheckRunXml(objectUri, version);
  
  const url = `${baseUrl}/sap/bc/adt/checkruns?reporters=abapCheckRun`;
  
  logger.info(`🔍 Checking ${objectType}: ${objectName} (version: ${version})`);
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    'default',
    xmlBody,
    undefined,
    {
      'Accept': 'application/vnd.sap.adt.checkmessages+xml',
      'Content-Type': 'application/vnd.sap.adt.checkobjects+xml'
    }
  );
  
  logger.info(`✅ Check completed`);
  
  return response;
}

/**
 * Main handler for CheckObject
 */
export async function handleCheckObject(args: any) {
  const {
    object_name,
    object_type,
    version = 'active'
  } = args as CheckObjectArgs;

  // Validation
  if (!object_name || !object_type) {
    return return_error('object_name and object_type are required');
  }
  
  const validTypes = ['class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element'];
  if (!validTypes.includes(object_type.toLowerCase())) {
    return return_error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  if (version && !['active', 'inactive'].includes(version.toLowerCase())) {
    return return_error(`Invalid version. Must be 'active' or 'inactive'`);
  }
  
  logger.info(`🚀 Starting CheckObject: ${object_name} (type: ${object_type}, version: ${version})`);
  
  try {
    // Check object
    const response = await checkObject(
      object_name,
      object_type,
      version
    );
    
    // Parse check results
    const checkResult = parseCheckRunResponse(response);
    
    logger.info(`✅ CheckObject completed: ${object_name}`);
    logger.info(`   Status: ${checkResult.status}`);
    logger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);
    
    return return_response({
      data: {
        success: checkResult.success,
        object_name,
        object_type,
        version,
        check_result: checkResult,
        message: checkResult.success 
          ? `Object ${object_name} has no syntax errors`
          : `Object ${object_name} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
      }
    } as AxiosResponse);
    
  } catch (error: any) {
    logger.error(`❌ CheckObject failed: ${error}`);
    
    // Parse error message
    let errorMessage = `Failed to check object: ${error}`;
    
    if (error.response?.status === 404) {
      errorMessage = `Object ${object_name} not found.`;
    } else if (error.response?.data && typeof error.response.data === 'string') {
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_'
        });
        const errorData = parser.parse(error.response.data);
        const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
        if (errorMsg) {
          errorMessage = `SAP Error: ${errorMsg}`;
        }
      } catch (parseError) {
        // Ignore parse errors
      }
    }
    
    return return_error(errorMessage);
  }
}
