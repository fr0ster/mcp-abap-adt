/**
 * A value a wire contract types `unknown` — an answer's `data`, a request's
 * `params` or `data`, the transport's `request` — told apart once, where it
 * enters: typed at the parse (`docs/development/CODE_GATES.md`). A reader
 * holds a {@link WireValue}, never the `unknown`; the value itself is only
 * handed on whole, to a sink that takes anything (`JSON.stringify`,
 * `String`).
 */
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { attr } from './thrownValue';

/**
 * What a wire value is, as its readers tell it apart. A kind that does not
 * hold the value itself (a list, an object, anything else) writes it out as
 * `String` does, on demand (`written`), so a reader never reads it again.
 */
export type WireValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'undefined' }
  | { readonly kind: 'null' }
  | { readonly kind: 'list'; readonly written: () => string }
  | {
      readonly kind: 'object';
      readonly written: () => string;
      /**
       * The member `name`, written out when it is a string, a number or a
       * boolean; else `undefined`.
       */
      readonly attribute: (name: string) => string | undefined;
    }
  | { readonly kind: 'other'; readonly written: () => string };

/**
 * `value` told apart: a string, bytes, `undefined`, `null`, a list, any
 * other object (its members read one by one, by name), or anything else (a
 * number, a boolean, a function).
 */
export function wireValueOf(value: unknown): WireValue {
  if (typeof value === 'string') return { kind: 'text', text: value };
  if (value instanceof Uint8Array) return { kind: 'bytes', bytes: value };
  if (value === undefined) return { kind: 'undefined' };
  if (value === null) return { kind: 'null' };
  const written = (): string => String(value);
  if (Array.isArray(value)) return { kind: 'list', written };
  if (typeof value === 'object') {
    return {
      kind: 'object',
      written,
      attribute: (name) => attr(value, name),
    };
  }
  return { kind: 'other', written };
}

/**
 * An answer's body as text, the way `String` writes it (bytes as UTF-8); an absent one
 * (`undefined`, `null`) is `''`. The body is read once, told apart by
 * {@link wireValueOf}, and written from what that answers.
 */
export function bodyTextOf(
  answer: Partial<Pick<IAdtWireResponse, 'data'>>,
): string {
  const body = wireValueOf(answer.data);
  switch (body.kind) {
    case 'text':
      return body.text;
    case 'undefined':
    case 'null':
      return '';
    case 'bytes':
      // A `Buffer`'s text, as UTF-8 — never its numbers.
      return new TextDecoder().decode(body.bytes);
    case 'list':
    case 'object':
    case 'other':
      return body.written();
  }
}
