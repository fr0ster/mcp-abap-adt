import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { AxiosError, AxiosResponse } from "axios";
import { getConfig } from "../index"; // getConfig needs to be exported from index.ts
import { AbapConnection } from "./connection/AbapConnection";
import { createAbapConnection } from "./connection/connectionFactory";
import { SapConfig, sapConfigSignature } from "./sapConfig";
import { getTimeout, getTimeoutConfig } from "./timeouts";
import { logger } from "./logger"; // Import the MCP-compatible logger

export { McpError, ErrorCode, AxiosResponse, logger, getTimeout, getTimeoutConfig };

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

let overrideConfig: SapConfig | undefined;
let overrideConnection: AbapConnection | undefined;
let cachedConnection: AbapConnection | undefined;
let cachedConfigSignature: string | undefined;

function disposeConnection(connection?: AbapConnection) {
  if (connection) {
    connection.reset();
  }
}

function getManagedConnection(): AbapConnection {
  if (overrideConnection) {
    return overrideConnection;
  }

  const config = overrideConfig ?? getConfig();
  const signature = sapConfigSignature(config);

  if (!cachedConnection || cachedConfigSignature !== signature) {
    disposeConnection(cachedConnection);
    cachedConnection = createAbapConnection(config);
    cachedConfigSignature = signature;
  }

  return cachedConnection;
}

export function setConfigOverride(override?: SapConfig) {
  overrideConfig = override;
  disposeConnection(overrideConnection);
  overrideConnection = override ? createAbapConnection(override) : undefined;

  // Reset shared connection so that it will be re-created lazily with fresh config
  disposeConnection(cachedConnection);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
}

export function setConnectionOverride(connection?: AbapConnection) {
  disposeConnection(overrideConnection);
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
 * Simplified ADT request function that uses configurable timeouts
 * @param url Request URL
 * @param method HTTP method
 * @param timeoutType Timeout type ('default', 'csrf', 'long') or custom number in ms
 * @param data Optional request data
 * @param params Optional request parameters
 * @returns Promise with the response
 */
export async function makeAdtRequestWithTimeout(
  url: string,
  method: string,
  timeoutType: 'default' | 'csrf' | 'long' | number = 'default',
  data?: any,
  params?: any
) {
  const timeout = getTimeout(timeoutType);
  return makeAdtRequest(url, method, timeout, data, params);
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
  params?: any
) {
  return getManagedConnection().makeAdtRequest({ url, method, timeout, data, params });
}
