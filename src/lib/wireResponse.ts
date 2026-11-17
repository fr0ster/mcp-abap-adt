/**
 * The wire answer a thrown request carries, read.
 *
 * A request that threw (axios, the connection, a batch envelope) carries its
 * answer in `response` — a value from outside the type system, so it is read
 * here, never assumed: an integer `status` and an object of `headers` make it
 * a wire answer, `statusText` may be absent (`''` then); anything else is
 * none.
 */
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { entries, isElement, isList } from './thrownValue';

/** A header's value as the wire answer types it. */
type IAdtHeaderValue = IAdtWireResponse['headers'][string];

/** A header's value as the wire types it, or `undefined` for one it cannot be. */
function headerValueOf(value: unknown): IAdtHeaderValue | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  if (isList(value) || isElement(value)) return value;
  return undefined;
}

/** The headers of a wire answer: each member whose value a header can hold. */
function headersOf(value: unknown): Record<string, IAdtHeaderValue> {
  const headers: Record<string, IAdtHeaderValue> = {};
  for (const [name, member] of entries(value)) {
    const read = headerValueOf(member);
    if (read !== undefined) headers[name] = read;
  }
  return headers;
}

/**
 * `value` as a wire answer: an integer `status` and object `headers`
 * required, `statusText` optional; else `undefined`.
 */
export function wireResponseOf(value: unknown): IAdtWireResponse | undefined {
  if (!isElement(value)) return undefined;
  const { status, headers, statusText } = value;
  if (typeof status !== 'number' || !Number.isInteger(status)) {
    return undefined;
  }
  if (!isElement(headers)) return undefined;
  return {
    data: value.data,
    status,
    statusText: typeof statusText === 'string' ? statusText : '',
    headers: headersOf(headers),
    ...('config' in value ? { config: value.config } : {}),
    ...('request' in value ? { request: value.request } : {}),
  };
}
