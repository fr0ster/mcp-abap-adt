// Round 8: a sink slot read by a nested assignment pattern, or by an array
// assignment pattern, is read as by name.
export interface ContentItem {
  json?: unknown;
}

export interface Answer {
  content: ContentItem;
  items: ContentItem[];
}

export function serialize(answer: Answer): string {
  return JSON.stringify(answer.content);
}

export function readNested(answer: Answer): string {
  let value: unknown;
  ({ content: { json: value } } = answer);
  return typeof value;
}

export function readFromList(answer: Answer): string {
  let value: unknown;
  [{ json: value }] = answer.items;
  return typeof value;
}
