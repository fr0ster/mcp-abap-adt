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

/** What a wire value is, as its readers tell it apart. */
export type WireValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'undefined' }
  | { readonly kind: 'null' }
  | { readonly kind: 'list' }
  | {
      readonly kind: 'object';
      /**
       * The member `name`, written out when it is a string, a number or a
       * boolean; else `undefined`.
       */
      readonly attribute: (name: string) => string | undefined;
    }
  | { readonly kind: 'other' };

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
  if (Array.isArray(value)) return { kind: 'list' };
  if (typeof value === 'object') {
    return { kind: 'object', attribute: (name) => attr(value, name) };
  }
  return { kind: 'other' };
}

/**
 * An answer's body as text, the way `String` writes it; an absent one
 * (`undefined`, `null`) is `''`. Told apart by {@link wireValueOf}, the body
 * itself only handed on whole to `String`.
 */
export function bodyTextOf(
  answer: Partial<Pick<IAdtWireResponse, 'data'>>,
): string {
  const body = wireValueOf(answer.data);
  return body.kind === 'undefined' || body.kind === 'null'
    ? ''
    : String(answer.data);
}
