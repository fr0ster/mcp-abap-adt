import { isJsonObject, parseJson } from './json';

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

  // The text read as JSON: an answer that is none is passed through as it is.
  const first = result.content[0];
  const data = first === undefined ? undefined : parseJson(first.text);
  if (data === undefined) return result;
  // A list takes no field and is written again as it is; any other value
  // that is not an object is answered unchanged.
  if (!isJsonObject(data) && !Array.isArray(data)) return result;
  const named = isJsonObject(data)
    ? { ...data, object_name: objectName }
    : data;
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(named, null, 2) }],
  };
}
