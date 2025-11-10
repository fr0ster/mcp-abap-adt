import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Validates transport request requirement based on package name.
 * For $TMP (local) package, transport request is optional.
 * For transportable packages, transport request is required.
 * 
 * Note: $TMP is the only local package in SAP. Each user has their own $TMP.
 * 
 * @param packageName - The package name to validate
 * @param transportRequest - The transport request (optional)
 * @throws {McpError} If validation fails
 */
export function validateTransportRequest(
  packageName: string,
  transportRequest: string | undefined
): void {
  const isLocal = isLocalPackage(packageName);
  
  if (!isLocal && !transportRequest) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Transport request is required for transportable packages (non-$TMP). For local development, use package_name: "$TMP".'
    );
  }
}

/**
 * Check if package is local ($TMP)
 * @param packageName - The package name to check
 * @returns true if package is $TMP, false otherwise
 */
export function isLocalPackage(packageName: string): boolean {
  return packageName === '$TMP';
}
