type McpResponse = {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
};

/**
 * Normalizes a low-level check handler response for high-level consumption.
 * - Strips session_id and session_state from JSON payload
 * - Adds object_name as canonical shared field
 * - Passes through error responses and non-JSON payloads unchanged
 */
export function normalizeCheckResponse(
  result: McpResponse,
  objectName: string,
): McpResponse {
  if (result.isError) return result;

  try {
    const data = JSON.parse(result.content[0].text);
    delete data.session_id;
    delete data.session_state;
    data.object_name = objectName;
    return {
      isError: false,
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  } catch {
    return result;
  }
}
