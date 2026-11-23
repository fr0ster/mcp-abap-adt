/**
 * `detail: 'raw'` is what ADT sent. A tool that makes one read answers that
 * document as it came; a tool that assembles several reads answers a JSON
 * array of the documents, in the order they were read, each as ADT sent it —
 * no parse, no projection, nothing of ours mixed in (the owner's ruling,
 * Codex round 4).
 *
 * The documents are the bodies the call's connection answered while the
 * call ran (`recordedWire`): the reads the tool made, batch envelopes
 * included as they came. A call on one connection is strictly sequential
 * (one session, one flow), so the bodies recorded are this call's.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { bodyTextOf } from '../wireValue';

/** What `run` answered, and every body the connection answered meanwhile, in order. */
export async function recordedWire<R>(
  connection: IAbapConnection,
  run: () => Promise<R>,
): Promise<{ result: R; documents: string[] }> {
  const documents: string[] = [];
  const own = Object.hasOwn(connection, 'makeAdtRequest');
  const original = connection.makeAdtRequest;
  connection.makeAdtRequest = async (...request) => {
    const answered = await original.apply(connection, request);
    documents.push(bodyTextOf(answered));
    return answered;
  };
  try {
    return { result: await run(), documents };
  } finally {
    if (own) connection.makeAdtRequest = original;
    else Reflect.deleteProperty(connection, 'makeAdtRequest');
  }
}

/** How a tool's reads stand: one document, or several assembled. */
export type WireShape = 'one' | 'assembled';

/** The raw answer of what ADT sent: the one document, or the array of them. */
export function wireText(
  documents: readonly string[],
  shape: WireShape,
): string {
  return shape === 'one' ? (documents[0] ?? '') : JSON.stringify(documents);
}

/** An answer of the MCP tool shape: what a raw answer replaces the text of. */
interface ToolAnswer {
  isError?: boolean | undefined;
  content: Array<{ type: string; text?: string }>;
}

/**
 * The tool's answer at `raw`: `run` (the tool at `full`, on the recording
 * connection) answered, and on success its text is what ADT sent. A failure
 * is answered as it is.
 */
export async function wireAnswer<A extends ToolAnswer>(
  connection: IAbapConnection,
  shape: WireShape,
  run: () => Promise<A>,
): Promise<A> {
  const { result, documents } = await recordedWire(connection, run);
  if (result.isError === true) return result;
  return {
    ...result,
    content: [{ type: 'text', text: wireText(documents, shape) }],
  };
}
