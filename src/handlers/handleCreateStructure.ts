/**
 * CreateStructure Handler - ABAP Structure Creation via ADT API
 * 
 * APPROACH:
 * - Similar to CreateTable pattern: POST with full XML body for structure creation
 * - Structure-specific XML structure with ddic:structure namespace
 * - Support for structure fields, includes, and type references
 * - Create → Activate → Verify workflow
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName } from '../lib/utils';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "CreateStructure",
  description: "Create a new ABAP structure in SAP system with fields and type references. Includes create, activate, and verify steps.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: { 
        type: "string", 
        description: "Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions." 
      },
      description: { 
        type: "string", 
        description: "Structure description. If not provided, structure_name will be used." 
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      fields: {
        type: "array",
        description: "Array of structure fields",
        items: {
          type: "object",
          properties: {
            name: { 
              type: "string", 
              description: "Field name (e.g., CLIENT, MATERIAL_ID)" 
            },
            data_type: { 
              type: "string", 
              description: "Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc." 
            },
            length: { 
              type: "number", 
              description: "Field length" 
            },
            decimals: { 
              type: "number", 
              description: "Decimal places (for DEC, CURR, QUAN types)",
              default: 0 
            },
            domain: {
              type: "string",
              description: "Domain name for type reference (optional)"
            },
            data_element: {
              type: "string", 
              description: "Data element name for type reference (optional)"
            },
            structure_ref: {
              type: "string",
              description: "Include another structure (optional)"
            },
            table_ref: {
              type: "string", 
              description: "Reference to table type (optional)"
            },
            description: { 
              type: "string", 
              description: "Field description" 
            }
          },
          required: ["name"]
        }
      },
      includes: {
        type: "array",
        description: "Include other structures in this structure",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Include structure name"
            },
            suffix: {
              type: "string", 
              description: "Optional suffix for include fields"
            }
          },
          required: ["name"]
        }
      }
    },
    required: ["structure_name", "package_name", "fields"]
  }
} as const;

interface StructureField {
  name: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  domain?: string;
  data_element?: string;
  structure_ref?: string;
  table_ref?: string;
  description?: string;
}

interface StructureInclude {
  name: string;
  suffix?: string;
}

interface CreateStructureArgs {
  structure_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  fields: StructureField[];
  includes?: StructureInclude[];
}

/**
 * Build XML for structure creation following DDIC structure pattern
 */
function buildCreateStructureXml(args: CreateStructureArgs): string {
  const description = args.description || args.structure_name;
  
  // Build fields XML
  const fieldsXml = args.fields.map(field => {
    const fieldProps: any = {
      'ddic:name': field.name,
      'ddic:description': field.description || ''
    };

    // Add type information based on what's provided
    if (field.data_element) {
      fieldProps['ddic:dataElement'] = field.data_element;
    } else if (field.domain) {
      fieldProps['ddic:domainName'] = field.domain;
    } else if (field.structure_ref) {
      fieldProps['ddic:structureRef'] = field.structure_ref;
    } else if (field.table_ref) {
      fieldProps['ddic:tableRef'] = field.table_ref;
    } else if (field.data_type) {
      // Direct type specification
      fieldProps['ddic:dataType'] = field.data_type;
      if (field.length !== undefined) {
        fieldProps['ddic:length'] = field.length;
      }
      if (field.decimals !== undefined) {
        fieldProps['ddic:decimals'] = field.decimals;
      }
    }

    return fieldProps;
  });

  // Build includes XML if provided
  let includesXml: any = undefined;
  if (args.includes && args.includes.length > 0) {
    includesXml = {
      'ddic:include': args.includes.map(inc => ({
        'ddic:structureName': inc.name,
        ...(inc.suffix && { 'ddic:suffix': inc.suffix })
      }))
    };
  }

  const structureData: any = {
    'ddic:structure': {
      'adtcore:objectType': 'STRU/DT',
      'adtcore:name': args.structure_name,
      'adtcore:description': description,
      'adtcore:language': 'EN',
      'adtcore:packageRef': {
        'adtcore:name': args.package_name
      },
      ...(args.transport_request && {
        'adtcore:transport': {
          'adtcore:name': args.transport_request
        }
      }),
      ...(includesXml && { 'ddic:includes': includesXml }),
      'ddic:fields': {
        'ddic:field': fieldsXml
      }
    }
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    format: true,
    suppressEmptyNode: true
  });

  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
  return xmlHeader + builder.build(structureData);
}

/**
 * Parse XML response to extract structure creation information
 */
function parseStructureCreationResponse(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  });
  
  try {
    const result = parser.parse(xml);
    
    // Check for error messages
    if (result.error || result['asx:abap']?.['asx:values']?.ERROR) {
      const errorMsg = result.error?.message || 
        result['asx:abap']?.['asx:values']?.ERROR?.MESSAGE || 
        'Unknown error during structure creation';
      throw new Error(errorMsg);
    }
    
    // Look for successful creation indicators
    if (result['ddic:structure']) {
      const structure = result['ddic:structure'];
      return {
        name: structure['adtcore:name'],
        description: structure['adtcore:description'],
        package: structure['adtcore:packageRef']?.['adtcore:name'],
        status: 'created',
        objectType: 'structure'
      };
    }
    
    // Fallback: return raw response
    return { raw: result, status: 'created' };
    
  } catch (parseError) {
    // If parsing fails, return raw XML
    return { 
      raw_xml: xml, 
      status: 'created',
      note: 'XML parsing failed, but structure creation might have succeeded'
    };
  }
}

/**
 * Activate the structure after creation
 */
async function activateStructure(structureName: string) {
  const url = `${await getBaseUrl()}/sap/bc/adt/activation`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/structures/${encodeSapObjectName(structureName)}" adtcore:name="${structureName}"/>
</adtcore:objectReferences>`;

  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', {
    'Content-Type': 'application/vnd.sap.adt.activation+xml'
  }, activationXml);

  return response;
}

/**
 * Verify structure exists and get its details
 */
async function verifyStructureCreation(structureName: string) {
  const url = `${await getBaseUrl()}/sap/bc/adt/ddic/structures/${encodeSapObjectName(structureName)}/source/main`;
  const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
  return response;
}

export async function handleCreateStructure(args: any): Promise<any> {
  try {
    const createStructureArgs = args as CreateStructureArgs;
    
    // Validate required parameters
    if (!createStructureArgs?.structure_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Structure name is required');
    }
    if (!createStructureArgs?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    if (!createStructureArgs?.fields || !Array.isArray(createStructureArgs.fields) || createStructureArgs.fields.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'At least one field is required');
    }

    const results: any[] = [];
    
    // Step 1: Create structure
    try {
      const createUrl = `${await getBaseUrl()}/sap/bc/adt/ddic/structures/${encodeSapObjectName(createStructureArgs.structure_name)}`;
      const structureXml = buildCreateStructureXml(createStructureArgs);
      
      results.push({
        step: 'create_structure',
        action: 'POST ' + createUrl,
        xml_payload: structureXml
      });

      const createResponse = await makeAdtRequestWithTimeout(createUrl, 'POST', 'default', {
        'Content-Type': 'application/vnd.sap.adt.ddic.structures.v1+xml'
      }, structureXml);

      const createResult = parseStructureCreationResponse(createResponse.data);
      results.push({
        step: 'create_structure',
        status: 'success',
        result: createResult
      });

    } catch (createError) {
      results.push({
        step: 'create_structure',
        status: 'error',
        error: createError instanceof Error ? createError.message : String(createError)
      });
      throw createError;
    }

    // Step 2: Activate structure
    try {
      results.push({
        step: 'activate_structure',
        action: 'Activating structure ' + createStructureArgs.structure_name
      });

      const activateResponse = await activateStructure(createStructureArgs.structure_name);
      results.push({
        step: 'activate_structure',
        status: 'success',
        http_status: activateResponse.status
      });

    } catch (activateError) {
      results.push({
        step: 'activate_structure',
        status: 'error',
        error: activateError instanceof Error ? activateError.message : String(activateError)
      });
      // Continue to verification even if activation fails
    }

    // Step 3: Verify structure creation
    try {
      results.push({
        step: 'verify_structure',
        action: 'Getting structure details to verify creation'
      });

      const verifyResponse = await verifyStructureCreation(createStructureArgs.structure_name);
      
      if (typeof verifyResponse.data === 'string' && verifyResponse.data.trim().startsWith('<?xml')) {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '',
          parseAttributeValue: true,
          trimValues: true
        });
        const verifyResult = parser.parse(verifyResponse.data);
        
        results.push({
          step: 'verify_structure',
          status: 'success',
          structure_details: verifyResult
        });
      } else {
        results.push({
          step: 'verify_structure',
          status: 'success',
          raw_response: verifyResponse.data
        });
      }

    } catch (verifyError) {
      results.push({
        step: 'verify_structure',
        status: 'error',
        error: verifyError instanceof Error ? verifyError.message : String(verifyError)
      });
    }

    // Summary
    const successSteps = results.filter(r => r.status === 'success').length;
    const summary = {
      structure_name: createStructureArgs.structure_name,
      package: createStructureArgs.package_name,
      total_steps: 3,
      successful_steps: successSteps,
      overall_status: successSteps >= 2 ? 'success' : 'partial_success',
      steps: results
    };

    return {
      isError: false,
      content: [{
        type: "text",
        text: JSON.stringify(summary, null, 2)
      }]
    };

  } catch (error) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `CreateStructure failed: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}