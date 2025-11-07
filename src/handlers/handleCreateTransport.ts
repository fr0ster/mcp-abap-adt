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
        description: "Target system for transport (optional, e.g., 'PRD', 'QAS')" 
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
  const owner = username;
  const target = args.target_system || 'PRD';

  return `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core">
  <tm:request>
    <tm:type>${transportType}</tm:type>
    <tm:description>${description}</tm:description>
    <tm:owner>${owner}</tm:owner>
    <tm:target>${target}</tm:target>
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
  const request = result['tm:request'] || result['request'];

  if (!request) {
    throw new McpError(ErrorCode.InternalError, 'Invalid transport response XML structure');
  }

  return {
    transport_number: request['tm:number'] || request['number'],
    description: request['tm:description'] || request['description'],
    type: request['tm:type'] || request['type'],
    status: request['tm:status'] || request['status'],
    owner: request['tm:owner'] || request['owner'],
    target_system: request['tm:target'] || request['target'],
    created_at: request['tm:createdAt'] || request['createdAt'],
    created_by: request['tm:createdBy'] || request['createdBy']
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
    const username = process.env.SAP_USER || 'MPCUSER';

    console.log(`[DEBUG] Creating transport: ${typedArgs.description}`);
    console.log(`[DEBUG] Type: ${typedArgs.transport_type || 'workbench'}`);
    console.log(`[DEBUG] Owner: ${typedArgs.owner || username}`);

    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/sap/bc/adt/cts/transportrequests`;

    const xmlBody = buildCreateTransportXml(typedArgs, username);
    const headers = {
      'Accept': 'application/vnd.sap.adt.transportorganizer.v1+xml',
      'Content-Type': 'application/vnd.sap.adt.transportorganizer.v1+xml'
    };

    console.log(`[DEBUG] POST to: ${url}`);
    console.log(`[DEBUG] Request body:\n${xmlBody}`);

    // Create transport request
    const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', xmlBody, undefined, headers);

    console.log('[DEBUG] CreateTransport response status:', response.status);
    console.log('[DEBUG] CreateTransport response data:', response.data);

    // Parse response
    const transportInfo = parseTransportResponse(response.data);

    return return_response({
      data: JSON.stringify({
        success: true,
        transport_request: transportInfo.transport_number,
        description: transportInfo.description,
        type: transportInfo.type,
        status: transportInfo.status,
        owner: transportInfo.owner,
        target_system: transportInfo.target_system,
        created_at: transportInfo.created_at,
        created_by: transportInfo.created_by,
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