import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Validates transport request requirement based on package name.
 * If transport_request is not provided, we assume it's a local object and let SAP handle the validation.
 * No strict validation - if creation fails, SAP will return an error.
 *
 * @param packageName - The package name to validate
 * @param transportRequest - The transport request (optional)
 * @param superPackage - The super package name (optional, not used for validation)
 */
export function validateTransportRequest(
  packageName: string,
  transportRequest: string | undefined,
  superPackage?: string
): void {
  // No strict validation - if transport_request is missing, we assume local object
  // SAP will return an error if transport is actually required
  // This allows flexible creation of both local and transportable objects
}

/**
 * Check if package is local ($TMP or ZLOCAL)
 * @param packageName - The package name to check
 * @returns true if package is $TMP or ZLOCAL, false otherwise
 */
export function isLocalPackage(packageName: string): boolean {
  const upperName = packageName.toUpperCase();
  return upperName === '$TMP' || upperName === 'ZLOCAL';
}
