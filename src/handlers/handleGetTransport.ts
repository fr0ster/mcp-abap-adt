/**
 * GetTransport Handler - Retrieve ABAP transport request information via ADT API
 * 
 * Retrieves transport request details including:
 * - Transport metadata (number, description, type, status)
 * - Owner and target system information
 * - Included objects and tasks
 * - Change history
 */

import { McpError, ErrorCode } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "GetTransport",
  description: "Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.",
  inputSchema: {
    type: "object",
    properties: {
      transport_number: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635, DEVK905123)" 
      },
      include_objects: {
        type: "boolean",
        description: "Include list of objects in transport (default: true)",
        default: true
      },
      include_tasks: {
        type: "boolean", 
        description: "Include list of tasks in transport (default: true)",
        default: true
      }
    },
    required: ["transport_number"]
  }
} as const;

interface GetTransportArgs {
  transport_number: string;
  include_objects?: boolean;
  include_tasks?: boolean;
}

/**
 * Parse transport request XML response
 */
function parseTransportXml(xmlData: string, includeObjects: boolean = true, includeTasks: boolean = true): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    parseAttributeValue: true,
    isArray: (name, jpath, isLeafNode, isAttribute) => {
      // Arrays for multiple objects/tasks
      return ['tm:object', 'tm:task', 'object', 'task'].includes(name);
    }
  });

  const result = parser.parse(xmlData);
  const root = result['tm:root'] || result['root'];
  
  if (!root) {
    throw new McpError(ErrorCode.InternalError, 'Invalid transport XML structure - no tm:root found');
  }

  // Get detailed transport info from tm:request inside tm:root
  const request = root['tm:request'] || {};
  
  // Extract basic transport information from both root attributes and request details
  const transportInfo = {
    number: root['adtcore:name'] || request['tm:number'] || root['name'],
    description: request['tm:desc'] || request['description'] || root['tm:description'],
    type: request['tm:type'] || root['tm:object_type'] || root['type'],
    status: request['tm:status'] || root['tm:status'],
    status_text: request['tm:status_text'],
    owner: request['tm:owner'] || root['tm:owner'],
    target_system: request['tm:target'] || root['tm:target'],
    target_desc: request['tm:target_desc'],
    created_at: root['adtcore:createdAt'] || request['tm:createdAt'] || root['createdAt'],
    created_by: root['adtcore:createdBy'] || request['tm:createdBy'] || root['createdBy'],
    changed_at: root['adtcore:changedAt'] || request['tm:changedAt'] || root['changedAt'],
    changed_by: root['adtcore:changedBy'] || request['tm:changedBy'] || root['changedBy'],
    release_date: request['tm:releaseDate'] || root['releaseDate'],
    client: request['tm:source_client'] || root['tm:client'],
    cts_project: request['tm:cts_project'],
    cts_project_desc: request['tm:cts_project_desc']
  };

  // Extract objects if requested
  let objects: any[] = [];
  if (includeObjects && request['tm:all_objects']) {
    const objectList = request['tm:all_objects']['tm:abap_object'] || [];
    objects = Array.isArray(objectList) ? objectList : [objectList];
    objects = objects.map(obj => ({
      name: obj['tm:name'],
      type: obj['tm:type'],
      wbtype: obj['tm:wbtype'],
      pgmid: obj['tm:pgmid'],
      description: obj['tm:obj_desc'],
      position: obj['tm:position'],
      lock_status: obj['tm:lock_status'],
      info: obj['tm:obj_info']
    }));
  }

  // Extract tasks if requested
  let tasks: any[] = [];
  if (includeTasks && request['tm:task']) {
    const taskList = Array.isArray(request['tm:task']) ? request['tm:task'] : [request['tm:task']];
    tasks = taskList.map(task => ({
      number: task['tm:number'],
      parent: task['tm:parent'],
      description: task['tm:desc'],
      type: task['tm:type'],
      status: task['tm:status'],
      status_text: task['tm:status_text'],
      owner: task['tm:owner'],
      target: task['tm:target'],
      target_desc: task['tm:target_desc'],
      client: task['tm:source_client'],
      created_at: task['tm:lastchanged_timestamp'],
      objects: task['tm:abap_object'] ? (Array.isArray(task['tm:abap_object']) ? task['tm:abap_object'] : [task['tm:abap_object']]).map(obj => ({
        name: obj['tm:name'],
        type: obj['tm:type'],
        wbtype: obj['tm:wbtype'],
        description: obj['tm:obj_desc'],
        position: obj['tm:position']
      })) : []
    }));
  }

  return {
    transport: transportInfo,
    objects: includeObjects ? objects : undefined,
    tasks: includeTasks ? tasks : undefined,
    object_count: objects.length,
    task_count: tasks.length
  };
}

/**
 * Main handler for GetTransport MCP tool
 */
export async function handleGetTransport(args: any) {
  try {
    // Validate required parameters
    if (!args?.transport_number) {
      throw new McpError(ErrorCode.InvalidParams, 'Transport number is required');
    }

    const typedArgs = args as GetTransportArgs;
    const includeObjects = typedArgs.include_objects !== false;
    const includeTasks = typedArgs.include_tasks !== false;

    console.log(`[DEBUG] GetTransport: ${typedArgs.transport_number}`);
    console.log(`[DEBUG] Include objects: ${includeObjects}, Include tasks: ${includeTasks}`);

    const baseUrl = await getBaseUrl();
    let url = `${baseUrl}/sap/bc/adt/cts/transportrequests/${typedArgs.transport_number}`;
    
    // Add query parameters for additional information
    const params: string[] = [];
    if (includeObjects) params.push('includeObjects=true');
    if (includeTasks) params.push('includeTasks=true');
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    const headers = {
      'Accept': 'application/vnd.sap.adt.transportorganizer.v1+xml'
    };

    console.log(`[DEBUG] GET from: ${url}`);

    // Get transport request
    const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);

    console.log('[DEBUG] GetTransport response status:', response.status);

    // Parse XML response
    const transportData = parseTransportXml(response.data, includeObjects, includeTasks);

    return return_response({
      data: JSON.stringify({
        success: true,
        transport_number: typedArgs.transport_number,
        ...transportData,
        message: `Transport ${typedArgs.transport_number} retrieved successfully`
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