import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { AxiosError, AxiosResponse } from "axios";
import { getConfig } from "../index"; // getConfig needs to be exported from index.ts
import {
  AbapConnection,
  createAbapConnection,
  SapConfig,
  sapConfigSignature,
  getTimeout,
  getTimeoutConfig,
} from "@mcp-abap-adt/connection";
import { loggerAdapter } from "./loggerAdapter";
import { logger } from "./logger";

// Initialize connection variables before exports to avoid circular dependency issues
let overrideConfig: SapConfig | undefined;
let overrideConnection: AbapConnection | undefined;
let cachedConnection: AbapConnection | undefined;
let cachedConfigSignature: string | undefined;

export { McpError, ErrorCode, AxiosResponse, getTimeout, getTimeoutConfig, logger };

/**
 * Encodes SAP object names for use in URLs
 * Handles namespaces with forward slashes that need to be URL encoded
 * @param objectName - The SAP object name (e.g., '/1CPR/CL_000_0SAP2_FAG')
 * @returns URL-encoded object name
 */
export function encodeSapObjectName(objectName: string): string {
  // URL encode the object name to handle namespaces with forward slashes
  return encodeURIComponent(objectName);
}

export function return_response(response: AxiosResponse) {
  return {
    isError: false,
    content: [
      {
        type: "text",
        text: response.data,
      },
    ],
  };
}
export function return_error(error: any) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${
          error instanceof AxiosError
            ? String(error.response?.data)
            : error instanceof Error
            ? error.message
            : String(error)
        }`,
      },
    ],
  };
}

function disposeConnection(connection?: AbapConnection) {
  if (connection) {
    connection.reset();
  }
}

export function getManagedConnection(): AbapConnection {
  if (overrideConnection) {
    return overrideConnection;
  }

  const config = overrideConfig ?? getConfig();
  const signature = sapConfigSignature(config);

  if (!cachedConnection || cachedConfigSignature !== signature) {
    disposeConnection(cachedConnection);
    cachedConnection = createAbapConnection(config, loggerAdapter);
    cachedConfigSignature = signature;
  }

  return cachedConnection;
}

export function setConfigOverride(override?: SapConfig) {
  overrideConfig = override;
  disposeConnection(overrideConnection);
  overrideConnection = override ? createAbapConnection(override, loggerAdapter) : undefined;

  // Reset shared connection so that it will be re-created lazily with fresh config
  disposeConnection(cachedConnection);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
}

export function setConnectionOverride(connection?: AbapConnection) {
  if (overrideConnection) {
    disposeConnection(overrideConnection);
  }
  overrideConnection = connection;
  overrideConfig = undefined;

  disposeConnection(cachedConnection);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
}

export function cleanup() {
  disposeConnection(overrideConnection);
  disposeConnection(cachedConnection);
  overrideConnection = undefined;
  overrideConfig = undefined;
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
}

export async function getBaseUrl() {
  return getManagedConnection().getBaseUrl();
}

export async function getAuthHeaders() {
  return getManagedConnection().getAuthHeaders();
}

/**
 * Makes an ADT request with specified timeout
 * @param url Request URL
 * @param method HTTP method
 * @param timeoutType Timeout type ('default', 'csrf', 'long') or custom number in ms
 * @param data Optional request data
 * @param params Optional request parameters
 * @param headers Optional custom headers
 * @returns Promise with the response
 */
export async function makeAdtRequestWithTimeout(
  url: string,
  method: string,
  timeoutType: 'default' | 'csrf' | 'long' | number = 'default',
  data?: any,
  params?: any,
  headers?: Record<string, string>
) {
  const timeout = getTimeout(timeoutType);
  return makeAdtRequest(url, method, timeout, data, params, headers);
}

/**
 * Fetches node structure from SAP ADT repository
 * @param parentName Parent object name
 * @param parentTechName Parent technical name
 * @param parentType Parent object type (e.g., 'PROG/P')
 * @param nodeKey Node key to fetch (e.g., '000000' for root, '006450' for includes)
 * @param withShortDescriptions Whether to include short descriptions
 * @returns Promise with the response containing node structure
 */
export async function fetchNodeStructure(
  parentName: string,
  parentTechName: string,
  parentType: string,
  nodeKey: string,
  withShortDescriptions: boolean = true
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/repository/nodestructure`;

  // Prepare query parameters
  const params = {
    parent_name: parentName,
    parent_tech_name: parentTechName,
    parent_type: parentType,
    withShortDescriptions: withShortDescriptions.toString()
  };

  // Prepare XML body
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
<asx:values>
<DATA>
<TV_NODEKEY>${nodeKey}</TV_NODEKEY>
</DATA>
</asx:values>
</asx:abap>`;

  // Make POST request with XML body
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    'default',
    xmlBody,
    params
  );

  return response;
}

export async function makeAdtRequest(
  url: string,
  method: string,
  timeout: number,
  data?: any,
  params?: any,
  headers?: Record<string, string>
) {
  return getManagedConnection().makeAdtRequest({ url, method, timeout, data, params, headers });
}

/**
 * Get system information from SAP ADT (for cloud systems)
 * Returns systemID and userName if available
 * This endpoint is available in cloud systems, not in on-premise
 */
export async function getSystemInformation(): Promise<{ systemID?: string; userName?: string } | null> {
  try {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/sap/bc/adt/core/http/systeminformation`;

    const headers = {
      'Accept': 'application/json'
    };

    const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);

    if (response.data && typeof response.data === 'object') {
      return {
        systemID: response.data.systemID,
        userName: response.data.userName
      };
    }

    return null;
  } catch (error) {
    // If endpoint doesn't exist (on-premise), return null
    // This is expected for on-premise systems
    return null;
  }
}
