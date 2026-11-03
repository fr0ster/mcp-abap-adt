import { child, isList } from './xml/tree';

/**
 * Shape a handler returns. `content` items may carry a custom `json` type that
 * the MCP SDK does not know about.
 */
export interface ToolContentItem {
  type?: string;
  json?: unknown;
  text?: unknown;
}

export interface ToolResultLike {
  isError?: boolean;
  content?: ToolContentItem[];
}

/**
 * Normalizes handler content into what the MCP SDK accepts: `json` items are
 * serialized to text, everything else is coerced to a text item.
 *
 * Used by both registration paths (BaseMcpServer and BaseHandlerGroup) so they
 * cannot drift apart. The `!== undefined` test is deliberate: an item with
 * `text: ''` must normalize to an empty string, not to a stringified object.
 */
export function normalizeToolContent(
  result: unknown,
): { type: 'text'; text: string }[] {
  const content = child(result, 'content');
  const items = isList(content) ? content : [];
  return items.map((item) => {
    const json = child(item, 'json');
    if (child(item, 'type') === 'json' && json !== undefined) {
      return { type: 'text' as const, text: JSON.stringify(json) };
    }
    const text = child(item, 'text');
    return {
      type: 'text' as const,
      text: text !== undefined ? String(text) : String(item || ''),
    };
  });
}
