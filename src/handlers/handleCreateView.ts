/**
 * CreateView Handler
 * Creates a new ABAP database view in the SAP system.
 */

import {
  getBaseUrl,
  getAuthHeaders,
  makeAdtRequestWithTimeout,
  return_error,
  return_response,
  logger,
  encodeSapObjectName,
} from "../lib/utils";

export interface CreateViewParams {
  view_name: string;
  description: string;
  package_name: string;
  base_tables: string[];
  join_conditions?: string[];
  fields?: string[];
  where_condition?: string;
  transport_request?: string;
  view_type?: 'database' | 'projection' | 'maintenance';
}

export async function handleCreateView(params: any) {
  const {
    view_name,
    description,
    package_name,
    base_tables,
    join_conditions = [],
    fields = [],
    where_condition = '',
    transport_request,
    view_type = 'database'
  } = params;

  if (!view_name || !description || !package_name || !base_tables || base_tables.length === 0) {
    return return_error(new Error(
      "Missing required parameters: view_name, description, package_name, and base_tables are required"
    ));
  }

  try {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/ddic/views`;
    
    // Build CREATE view XML
    const viewXml = buildCreateViewXml({
      view_name,
      description,
      package_name,
      base_tables,
      join_conditions,
      fields,
      where_condition,
      transport_request,
      view_type
    });

    logger.info(`Creating view ${view_name} in package ${package_name}`);
    
    const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', {
      'Content-Type': 'application/vnd.sap.adt.views+xml'
    }, viewXml);

    if (response.status >= 200 && response.status < 300) {
      logger.info(`View ${view_name} created successfully`);
      
      // Parse response to extract view details
      const result = parseViewResponse(response.data, {
        view_name,
        description,
        package_name,
        transport_request
      });

      return return_response(response);
    } else {
      throw new Error(`Failed to create view: ${response.status} ${response.statusText}`);
    }

  } catch (error: any) {
    logger.error(`Error creating view ${view_name}:`, error.message);
    return return_error(error);
  }
}

function buildCreateViewXml(params: CreateViewParams): string {
  const {
    view_name,
    description,
    package_name,
    base_tables,
    join_conditions,
    fields,
    where_condition,
    transport_request,
    view_type
  } = params;

  // Build fields list
  const fieldsList = fields && fields.length > 0 
    ? fields.map(field => `    <ddic:field name="${field}"/>`).join('\n')
    : base_tables.map(table => `    <ddic:field name="${table}.*"/>`).join('\n');

  // Build join conditions
  const joinsList = join_conditions && join_conditions.length > 0
    ? join_conditions.map(condition => `    <ddic:join>${condition}</ddic:join>`).join('\n')
    : '';

  // Build where condition
  const whereClause = where_condition 
    ? `  <ddic:where>${where_condition}</ddic:where>`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ddic:view xmlns:ddic="http://www.sap.com/adt/ddic"
           xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:name>${view_name}</adtcore:name>
  <adtcore:description language="EN">${description}</adtcore:description>
  <adtcore:package>${package_name}</adtcore:package>
  ${transport_request ? `<adtcore:transport>${transport_request}</adtcore:transport>` : ''}
  <ddic:type>${view_type}</ddic:type>
  <ddic:tables>
${base_tables.map(table => `    <ddic:table name="${table}"/>`).join('\n')}
  </ddic:tables>
  <ddic:fields>
${fieldsList}
  </ddic:fields>
  ${joinsList ? `<ddic:joins>\n${joinsList}\n  </ddic:joins>` : ''}
  ${whereClause}
</ddic:view>`;

  return xml;
}

function parseViewResponse(responseData: any, requestParams: any) {
  // Try to parse response data
  let responseText = '';
  if (typeof responseData === 'string') {
    responseText = responseData;
  } else if (responseData && typeof responseData === 'object') {
    responseText = JSON.stringify(responseData);
  }

  const result = {
    success: true,
    view_name: requestParams.view_name,
    description: requestParams.description,
    package_name: requestParams.package_name,
    transport_request: requestParams.transport_request || null,
    type: 'VIEW',
    message: `Database view ${requestParams.view_name} created successfully`,
    response_data: responseText
  };

  return result;
}