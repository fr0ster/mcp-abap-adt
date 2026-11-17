/**
 * Validates transport request requirement based on package name.
 * If transport_request is not provided, we assume it's a local object and let SAP handle the validation.
 * No strict validation - if creation fails, SAP will return an error.
 *
 * @param packageName - The package name to validate
 * @param transportRequest - The transport request (optional)
 */
export function validateTransportRequest(
  _packageName: string,
  _transportRequest: string | undefined,
): void {
  // No strict validation - if transport_request is missing, we assume local object
  // SAP will return an error if transport is actually required
  // This allows flexible creation of both local and transportable objects
}
