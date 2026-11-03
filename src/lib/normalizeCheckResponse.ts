import { isElement, isList } from './xml/tree';

type McpResponse = {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
};

/**
 * Normalizes a low-level check handler response for high-level consumption.
 * - Adds object_name as canonical shared field
 * - Passes through error responses and non-JSON payloads unchanged
 */
export function normalizeCheckResponse(
  result: McpResponse,
  objectName: string,
): McpResponse {
  if (result.isError) return result;

  let data: unknown;
  try {
    data = JSON.parse(result.content[0].text);
  } catch {
    return result;
  }
  // A list takes no field and is written again as it is; any other value
  // that is not an object is answered unchanged.
  if (!isElement(data) && !isList(data)) return result;
  const named = isElement(data) ? { ...data, object_name: objectName } : data;
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(named, null, 2) }],
  };
}
