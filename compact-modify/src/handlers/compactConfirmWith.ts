/**
 * The full transport writes say how to confirm them by naming the full set's
 * read, `ReadTransportObjects`. Compact has no such tool: the same read is
 * `HandlerGet` with `object_type: TRANSPORT`. So the compact tools rewrite that
 * one sentence in the answer, and nothing else — the full tools keep naming the
 * full tool.
 */

import { isJsonObject, jsonAt, jsonOf } from '@mcp-abap-adt/lib/compact-shared';

const FULL_READ = 'ReadTransportObjects';
const COMPACT_READ = 'HandlerGet with object_type TRANSPORT';

type Answer = { isError?: boolean; content?: { type: string; text: string }[] };

export function namingHandlerGet<T extends Answer>(answer: T): T {
  if (answer.isError || !answer.content) return answer;
  const content = answer.content.map((part) => {
    if (part.type !== 'text') return part;
    const payload = jsonOf(part.text);
    const confirmWith = jsonAt(payload, 'confirm_with');
    if (
      payload === undefined ||
      !isJsonObject(payload) ||
      typeof confirmWith !== 'string' ||
      !confirmWith.includes(FULL_READ)
    ) {
      return part;
    }
    return {
      ...part,
      text: JSON.stringify(
        {
          ...payload,
          confirm_with: confirmWith.replaceAll(FULL_READ, COMPACT_READ),
        },
        null,
        2,
      ),
    };
  });
  return { ...answer, content };
}
