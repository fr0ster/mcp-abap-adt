// Passes: the exception type and the status an error carries, compared.
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';

export function isMissing(error: IAdtError): boolean {
  return (
    error.response?.status === 404 ||
    error.adtType === 'ExceptionResourceNotFound'
  );
}
