/**
 * CreateTransport Handler - Create new ABAP transport request via ADT API
 *
 * Creates a new transport request for development objects.
 * Transport requests are essential for moving changes between SAP systems.
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "CreateTransport",
  description: "Create a new ABAP transport request in SAP system for development objects.",
  inputSchema: {
    type: "object",
    properties: {
      transport_type: {
        type: "string",
        description: "Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)",
        enum: ["workbench", "customizing"],
        default: "workbench"
      },
      description: {
        type: "string",
        description: "Transport request description (mandatory)"
      },
      target_system: {
        type: "string",
        description: "Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'"
      },
      owner: {
        type: "string",
        description: "Transport owner (optional, defaults to current user)"
      }
    },
    required: ["description"]
  }
} as const;

interface CreateTransportArgs {
  transport_type?: string;
  description: string;
  target_system?: string;
  owner?: string;
}

/**
 * Generate unique request ID for ADT request
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Create transport request XML payload
 */
function buildCreateTransportXml(args: CreateTransportArgs, username: string): string {
  const transportType = args.transport_type === 'customizing' ? 'T' : 'K';
  const description = args.description || 'Transport request created via MCP';
  const owner = args.owner || username;
  // If target_system is not provided or empty, use "LOCAL"
  const target = args.target_system && args.target_system.trim()
    ? `/${args.target_system}/`
    : 'LOCAL';

  return `<?xml version="1.0" encoding="ASCII"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">
  <tm:request tm:desc="${description}" tm:type="${transportType}" tm:target="${target}" tm:cts_project="">
    <tm:task tm:owner="${owner}"/>
  </tm:request>
</tm:root>`;
}

/**
 * Parse transport creation response
 */
function parseTransportResponse(xmlData: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
  });

  const result = parser.parse(xmlData);
  const root = result['tm:root'] || result['root'];

  if (!root) {
    throw new McpError(ErrorCode.InternalError, 'Invalid transport response XML structure - no tm:root found');
  }

  const request = root['tm:request'] || {};
  const task = request['tm:task'] || {};

  console.log('[DEBUG] CreateTransport parsed request:', JSON.stringify(request, null, 2));
  console.log('[DEBUG] CreateTransport parsed task:', JSON.stringify(task, null, 2));

  return {
    transport_number: request['tm:number'],
    description: request['tm:desc'] || request['tm:description'],
    type: request['tm:type'],
    target_system: request['tm:target'],
    target_desc: request['tm:target_desc'],
    cts_project: request['tm:cts_project'],
    cts_project_desc: request['tm:cts_project_desc'],
    uri: request['tm:uri'],
    parent: request['tm:parent'],
    owner: task['tm:owner'] || request['tm:owner'] // Owner is in tm:task
  };
}

/**
 * Main handler for CreateTransport MCP tool
 */
export async function handleCreateTransport(args: any) {
  try {
    // Validate required parameters
    if (!args?.description) {
      throw new McpError(ErrorCode.InvalidParams, 'Transport description is required');
    }

    const typedArgs = args as CreateTransportArgs;
    const username = process.env.SAP_USERNAME || process.env.SAP_USER || 'DEVELOPER';

    console.log(`[DEBUG] Creating transport: ${typedArgs.description}`);
    console.log(`[DEBUG] Type: ${typedArgs.transport_type || 'workbench'}`);
    console.log(`[DEBUG] Owner: ${typedArgs.owner || username}`);

    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/sap/bc/adt/cts/transportrequests`;

    const xmlBody = buildCreateTransportXml(typedArgs, username);
    const headers = {
      'Accept': 'application/vnd.sap.adt.transportorganizer.v1+xml',
      'Content-Type': 'text/plain'
    };

    console.log(`[DEBUG] POST to: ${url}`);
    console.log(`[DEBUG] Request body:\n${xmlBody}`);

    // Create transport request
    const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', xmlBody, undefined, headers);

    console.log('[DEBUG] CreateTransport response status:', response.status);
    console.log('[DEBUG] CreateTransport response data:', response.data);

    // Parse response and add known information from request
    const transportInfo = parseTransportResponse(response.data);
    const requestOwner = typedArgs.owner || username;

    return return_response({
      data: JSON.stringify({
        success: true,
        transport_request: transportInfo.transport_number,
        description: transportInfo.description,
        type: transportInfo.type,
        target_system: transportInfo.target_system,
        target_desc: transportInfo.target_desc,
        cts_project: transportInfo.cts_project,
        owner: requestOwner, // Use owner from request since response doesn't include it
        uri: transportInfo.uri,
        message: `Transport request ${transportInfo.transport_number} created successfully`
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
