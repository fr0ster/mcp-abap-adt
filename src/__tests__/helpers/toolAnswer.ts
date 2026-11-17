/**
 * A tool's answer as an entry's call hands it back (`unknown`): checked to
 * be the MCP result shape — `content` items with their text, `isError` when
 * stated — and refused, saying so, when it is not.
 */
export interface ToolAnswer {
  isError?: boolean;
  content: Array<{ type?: string; text: string }>;
}

export function toolAnswer(value: unknown): ToolAnswer {
  if (typeof value !== 'object' || value === null || !('content' in value)) {
    throw new Error('the call answered no tool result');
  }
  const listed: unknown = value.content;
  if (!Array.isArray(listed)) throw new Error('the answer has no content list');
  const items: unknown[] = listed;
  const content = items.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('text' in item) ||
      typeof item.text !== 'string'
    ) {
      throw new Error('a content item has no text');
    }
    return 'type' in item && typeof item.type === 'string'
      ? { type: item.type, text: item.text }
      : { text: item.text };
  });
  return 'isError' in value && typeof value.isError === 'boolean'
    ? { isError: value.isError, content }
    : { content };
}
