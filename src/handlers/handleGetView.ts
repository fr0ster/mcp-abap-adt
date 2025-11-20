/**
 * GetView Handler - ABAP Database View Retrieval via ADT API
 *
 * APPROACH:
 * - Similar to GetTable pattern: GET request to retrieve view definition
 * - View-specific XML structure with ddic:view namespace
 * - Parse tables, fields, joins, and selection conditions
 * - Support for both normal views and maintenance views
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { writeResultToFile } from '../lib/writeResultToFile';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetView",
  description: "Retrieve ABAP database view definition including tables, fields, joins, and selection conditions.",
  inputSchema: {
    view_name: z.string().describe("Name of the ABAP database view"),
    filePath: z.string().optional().describe("Optional file path to write the result to")
  }
} as const;

/**
 * Parse database view XML structure
 */
function parseViewXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  });
  const result = parser.parse(xml);

  // DDIC Database View (VIEW/DV)
  if (result['ddic:view']) {
    const v = result['ddic:view'];

    // Parse view tables
    const tables = Array.isArray(v['ddic:tables']?.['ddic:table'])
      ? v['ddic:tables']['ddic:table']
      : v['ddic:tables']?.['ddic:table']
      ? [v['ddic:tables']['ddic:table']]
      : [];

    // Parse view fields
    const fields = Array.isArray(v['ddic:fields']?.['ddic:field'])
      ? v['ddic:fields']['ddic:field']
      : v['ddic:fields']?.['ddic:field']
      ? [v['ddic:fields']['ddic:field']]
      : [];

    // Parse joins
    const joins = Array.isArray(v['ddic:joins']?.['ddic:join'])
      ? v['ddic:joins']['ddic:join']
      : v['ddic:joins']?.['ddic:join']
      ? [v['ddic:joins']['ddic:join']]
      : [];

    // Parse selection conditions
    const conditions = Array.isArray(v['ddic:conditions']?.['ddic:condition'])
      ? v['ddic:conditions']['ddic:condition']
      : v['ddic:conditions']?.['ddic:condition']
      ? [v['ddic:conditions']['ddic:condition']]
      : [];

    return {
      name: v['adtcore:name'],
      objectType: 'view',
      description: v['adtcore:description'],
      package: v['adtcore:packageRef']?.['adtcore:name'] || null,
      viewType: v['ddic:viewType'] || 'database_view',
      maintenanceAllowed: v['ddic:maintenanceAllowed'] === 'true',
      tables: tables.map(t => ({
        name: t['ddic:tableName'] || t['ddic:name'],
        alias: t['ddic:alias'],
        position: parseInt(t['ddic:position'] || '0', 10)
      })),
      fields: fields.map(f => ({
        name: f['ddic:fieldName'] || f['ddic:name'],
        table: f['ddic:tableName'],
        alias: f['ddic:alias'],
        dataType: f['ddic:dataType'],
        length: parseInt(f['ddic:length'] || '0', 10),
        decimals: parseInt(f['ddic:decimals'] || '0', 10),
        key: f['ddic:keyFlag'] === 'true',
        aggregation: f['ddic:aggregation'],
        description: f['ddic:description']
      })),
      joins: joins.map(j => ({
        leftTable: j['ddic:leftTable'],
        rightTable: j['ddic:rightTable'],
        joinType: j['ddic:joinType'] || 'INNER',
        condition: j['ddic:condition']
      })),
      conditions: conditions.map(c => ({
        field: c['ddic:fieldName'],
        operator: c['ddic:operator'],
        value: c['ddic:value'],
        table: c['ddic:tableName']
      })),
      generatedSql: v['ddic:generatedSql']
    };
  }

  // Fallback for other view types or unstructured XML
  if (result['asx:abap']?.['asx:values']) {
    // Handle ABAP serialized view data
    const abapData = result['asx:abap']['asx:values'];
    return {
      objectType: 'view',
      abap_structure: abapData,
      raw: result
    };
  }

  // Complete fallback: return raw XML structure
  return {
    raw: result,
    note: 'Unrecognized view XML structure, returning raw parsed content'
  };
}

/**
 * Parse view object properties XML from ADT repository information system
 */
function parseViewPropertiesXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });

  const result = parser.parse(xml);

  if (result['opr:objectProperties']?.['opr:object']) {
    const obj = result['opr:objectProperties']['opr:object'];
    const properties = result['opr:objectProperties']['opr:property'] || [];

    return {
      name: obj['@_name'],
      text: obj['@_text'],
      package: obj['@_package'],
      type: obj['@_type'],
      expandable: obj['@_expandable'],
      properties: Array.isArray(properties) ? properties.map(prop => ({
        facet: prop['@_facet'],
        name: prop['@_name'],
        displayName: prop['@_displayName'],
        text: prop['@_text'],
        hasChildrenOfSameFacet: prop['@_hasChildrenOfSameFacet']
      })) : []
    };
  }

  return {
    raw: result,
    note: 'Unrecognized object properties XML structure'
  };
}

/**
 * Get database view contents (actual data)
 */
async function getViewContents(viewName: string, maxRows: number = 100) {
  try {
    // Use SQL query handler to get view data
    const sqlQuery = `SELECT * FROM ${viewName}`;
    const url = `${await getBaseUrl()}/sap/bc/adt/datapreview/freestyle`;

    const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', {
      'Content-Type': 'text/plain; charset=utf-8'
    }, sqlQuery);

    // Safely handle response data to avoid circular reference issues
    let responseData;
    try {
      if (typeof response.data === 'object' && response.data !== null) {
        // Try to safely serialize the object
        responseData = JSON.parse(JSON.stringify(response.data));
      } else {
        responseData = response.data;
      }
    } catch (serializationError) {
      // If serialization fails, convert to string
      responseData = String(response.data);
    }

    return {
      query: sqlQuery,
      maxRows: maxRows,
      data: responseData,
      dataType: typeof response.data,
      note: 'View contents retrieved successfully'
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      note: 'Could not retrieve view data - view might not be activated or accessible'
    };
  }
}

export async function handleGetView(args: any) {
  try {
    if (!args?.view_name) {
      throw new McpError(ErrorCode.InvalidParams, 'View name is required');
    }

    const results: any = {
      view_name: args.view_name,
      timestamp: new Date().toISOString()
    };

    // Step 1: Detect view type and get definition
    let definitionSuccess = false;
    let viewType = 'unknown';

    // Try CDS View first (modern views with DDL source)
    try {
      const cdsUrl = `${await getBaseUrl()}/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(args.view_name)}`;
      const cdsResponse = await makeAdtRequestWithTimeout(cdsUrl, 'GET', 'default');

      if (cdsResponse.status === 200 && typeof cdsResponse.data === 'string') {
        viewType = 'CDS_VIEW';
        results.definition = {
          source: 'cds_ddl',
          type: 'CDS View',
          ddl_source: cdsResponse.data,
          note: 'Modern CDS View with DDL source code'
        };
        definitionSuccess = true;
      }
    } catch (cdsError) {
      // Not a CDS view or not accessible, try database view
    }

    // Try Database View (classic views with metadata only)
    if (!definitionSuccess) {
      try {
        const objectUri = `/sap/bc/adt/vit/wb/object_type/viewdv/object_name/${args.view_name}`;
        const encodedUri = encodeURIComponent(objectUri);
        const propertiesUrl = `${await getBaseUrl()}/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${encodedUri}`;

        const propertiesResponse = await makeAdtRequestWithTimeout(propertiesUrl, 'GET', 'default');

        if (typeof propertiesResponse.data === 'string' && propertiesResponse.data.trim().startsWith('<?xml')) {
          const viewProperties = parseViewPropertiesXml(propertiesResponse.data);
          viewType = 'DATABASE_VIEW';
          results.definition = {
            source: 'database_view_properties',
            type: 'Database View',
            ...viewProperties,
            note: 'Classic database view with metadata only'
          };
          definitionSuccess = true;
        }
      } catch (dbViewError) {
        results.definition = {
          error: dbViewError instanceof Error ? dbViewError.message : String(dbViewError),
          note: 'Could not retrieve view as CDS or Database View'
        };
      }
    }

    // Step 2: Try to get view contents (optional, may fail if view is not accessible)
    try {
      const maxRows = args.max_rows || 100;
      const contentsResult = await getViewContents(args.view_name, maxRows);
      results.contents = contentsResult;
    } catch (contentsError) {
      results.contents = {
        error: contentsError instanceof Error ? contentsError.message : String(contentsError),
        note: 'Could not retrieve view contents - this is normal for some view types'
      };
    }

    // Add view type to results
    results.view_type = viewType;
    results.detection_note = viewType === 'CDS_VIEW'
      ? 'Modern CDS View detected - has DDL source code'
      : viewType === 'DATABASE_VIEW'
      ? 'Classic Database View detected - metadata only'
      : 'Could not determine view type';

    // Safely serialize results to avoid circular reference issues
    let serializedResults;
    try {
      serializedResults = JSON.stringify(results, null, 2);
    } catch (jsonError) {
      // If JSON serialization fails, create a safe version
      const safeResults = {
        view_name: results.view_name,
        timestamp: results.timestamp,
        view_type: results.view_type,
        detection_note: results.detection_note,
        definition: {
          source: results.definition?.source || 'unknown',
          type: results.definition?.type || 'unknown',
          note: results.definition?.note || 'No additional info',
          error: results.definition?.error || null
        },
        contents: {
          error: results.contents?.error || 'Serialization failed',
          note: 'Could not serialize view contents - possible circular reference',
          dataType: results.contents?.dataType || 'unknown'
        },
        serialization_error: jsonError instanceof Error ? jsonError.message : String(jsonError)
      };
      serializedResults = JSON.stringify(safeResults, null, 2);
    }

    const finalResult = {
      isError: false,
      content: [{
        type: "text",
        text: serializedResults
      }]
    };

    // Write to file if path provided
    if (args.filePath) {
      writeResultToFile(serializedResults, args.filePath);
    }

    return finalResult;

  } catch (error) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `GetView failed: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}
