// The closed rule, member reads: a member a declaration outside the
// repository types `unknown` or `any` is read only at a boundary — inside a
// listed function, whole into a sink, keys alone. Inspecting it is reading
// it. A whole third-party value held as such reads nothing.
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type * as z from 'zod';

type ToolArgs = Readonly<Record<string, unknown>>;

declare function handOn(args: ToolArgs): string;

// Refused: read by name, by a literal key, through an optional chain.
export function byName(answer: IAdtWireResponse): number {
  const body = answer.data;
  return body === null ? 0 : 1;
}

export function byKey(options: IAbapRequestOptions): boolean {
  const params = options['params'];
  return params === null;
}

export function chained(answer: IAdtWireResponse | undefined): string {
  return String(answer?.request ? 'sent' : 'none');
}

// Refused: inspected, every way.
export function inspected(answer: IAdtWireResponse): number {
  let seen = 0;
  if (typeof answer.data === 'string') seen += 1;
  if (answer.data === undefined) seen += 1;
  if (answer.data instanceof Uint8Array) seen += 1;
  if (!answer.data) seen += 1;
  if (answer.data) seen += 1;
  return seen;
}

// Passes: whole into a sink, discarded, keys alone, as tool arguments.
export function passedOn(answer: IAdtWireResponse): string {
  answer.data;
  void answer.request;
  return `${JSON.stringify(answer.data)}${String(answer.request)}`;
}

export function keysAlone(schema: z.ZodObject): number {
  let keys = Object.keys(schema.shape).length;
  keys += Reflect.ownKeys(schema.shape).length;
  for (const key in schema.shape) keys += key.length;
  return keys;
}

export function asArguments(schema: z.ZodObject, input: string): string {
  const parsed = schema.safeParse(input);
  return parsed.success ? handOn(parsed.data) : '';
}

// Passes: a whole third-party value held, read for its typed members only.
export function heldWhole(answer: IAdtWireResponse): number {
  const kept: IAdtWireResponse = answer;
  const { status } = kept;
  return status + kept.statusText.length;
}

// Inside a listed parse function: read there.
export function parseBody(answer: IAdtWireResponse): string {
  const body = answer.data;
  return typeof body === 'string' ? body : '';
}

// Bound by the caller: an `unknown` we wrote is charged where written, not
// read off the third party — the same type, taken from its default, is.
export function suppliedByUs(answer: IAdtWireResponse<unknown>): boolean {
  const map = new Map<string, unknown>([['x', answer.status]]);
  return map.get('x') !== undefined && answer.data !== undefined;
}

export function fromTheDefault(answer: IAdtWireResponse): boolean {
  return answer.data !== undefined;
}
