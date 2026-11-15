// The closed rule, defaults: a default tests for `undefined` and may put
// another value in its place, so a parameter or a binding with one does not
// hand the third party's `unknown` on whole — it reads it.
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

// Refused: a callback's parameter with a default, written or contextual.
export function written(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key: string, value: unknown = 'fallback') =>
      String(value),
    ),
  );
}

export function contextual(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key, value = 'fallback') => String(value)),
  );
}

// Refused: a destructuring binding with a default, of a variable or of a
// callback's parameter.
export function binding(answer: IAdtWireResponse): string {
  const { data = '' } = answer;
  return String(data);
}

export function inCallback(answers: readonly IAdtWireResponse[]): string[] {
  return answers.map(({ data = '' }) => String(data));
}

// Passes: no default, handed on whole.
export function handsOn(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key: string, value: unknown) => String(value)),
  );
}
