// A sink slot: a content item's `json` only leaves the program, serialized
// by its one reader, so an `unknown` under it is a sink whatever reaches it.
// A read of the slot anywhere else reads a typed value back.
export interface Order {
  readonly id: string;
}

export interface ContentItem {
  type?: string;
  json?: unknown;
}

export interface Answer {
  isError?: boolean;
  content?: ContentItem[];
}

export function serialize(answer: Answer): string[] {
  return (answer.content ?? []).map((item) => JSON.stringify(item.json));
}

export function answerOf(order: Order): Answer {
  return { content: [{ type: 'json', json: order }] };
}

export function readBack(answer: Answer): boolean {
  const first = answer.content?.[0];
  if (first === undefined) return false;
  const { json } = first;
  return first.json !== undefined && json !== null;
}
