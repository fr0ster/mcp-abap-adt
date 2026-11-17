/**
 * What the integration helpers read of a thrown value: it comes from outside
 * the type system (a `catch` binds `unknown`), so it is read by shape.
 */

/** A thrown value's words: an Error's message, anything else as a string. */
export function thrownWords(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return String(error);
}

/** The HTTP status a thrown value carries as `response.status`, if any. */
export function thrownStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }
  const response = error.response;
  if (
    typeof response !== 'object' ||
    response === null ||
    !('status' in response)
  ) {
    return undefined;
  }
  return typeof response.status === 'number' ? response.status : undefined;
}
