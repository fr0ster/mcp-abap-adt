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
  const request = result['tm:request'] || result['request'];

  if (!request) {
    throw new McpError(ErrorCode.InternalError, 'Invalid transport XML structure');
  }

  // Extract basic transport information
  const transportInfo = {
    number: request['tm:number'] || request['number'],
    description: request['tm:description'] || request['description'],
    type: request['tm:type'] || request['type'],
    status: request['tm:status'] || request['status'],
    owner: request['tm:owner'] || request['owner'],
    target_system: request['tm:target'] || request['target'],
    created_at: request['tm:createdAt'] || request['createdAt'],
    created_by: request['tm:createdBy'] || request['createdBy'],
    changed_at: request['tm:changedAt'] || request['changedAt'],
    changed_by: request['tm:changedBy'] || request['changedBy'],
    release_date: request['tm:releaseDate'] || request['releaseDate'],
    client: request['tm:client'] || request['client']
  };

  // Extract objects if requested
  let objects: any[] = [];
  if (includeObjects && request['tm:objects']) {
    const objectList = request['tm:objects']['tm:object'] || request['tm:objects']['object'] || [];
    objects = Array.isArray(objectList) ? objectList : [objectList];
    objects = objects.map(obj => ({
      name: obj['tm:name'] || obj['name'],
      type: obj['tm:type'] || obj['type'],
      package: obj['tm:package'] || obj['package'],
      status: obj['tm:status'] || obj['status'],
      lock_status: obj['tm:lockStatus'] || obj['lockStatus']
    }));
  }

  // Extract tasks if requested
  let tasks: any[] = [];
  if (includeTasks && request['tm:tasks']) {
    const taskList = request['tm:tasks']['tm:task'] || request['tm:tasks']['task'] || [];
    tasks = Array.isArray(taskList) ? taskList : [taskList];
    tasks = tasks.map(task => ({
      number: task['tm:number'] || task['number'],
      description: task['tm:description'] || task['description'],
      type: task['tm:type'] || task['type'],
      status: task['tm:status'] || task['status'],
      owner: task['tm:owner'] || task['owner'],
      created_at: task['tm:createdAt'] || task['createdAt']
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
      'Accept': 'application/vnd.sap.cts.adt.tm.request.v1+xml'
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