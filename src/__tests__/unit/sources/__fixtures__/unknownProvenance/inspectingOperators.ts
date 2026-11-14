// The closed rule, operators that inspect: the left operand of `||`, `&&`
// and `??`, a conditional's condition and `!` test a third party's
// `unknown` or `any` — truthy, nullish — so they read it, wherever the
// result lands. A right operand or a branch is handed on whole.
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

// Refused: tested on the way into a sink.
export function tested(answer: IAdtWireResponse): string {
  return [
    JSON.stringify(answer.data || 'fallback'),
    JSON.stringify(answer.data && 'present'),
    JSON.stringify(answer.data ?? 'absent'),
    JSON.stringify(answer.data ? 'present' : 'absent'),
    JSON.stringify(!answer.data),
    JSON.stringify((answer.data || 'fallback') ?? 'absent'),
  ].join('');
}

// Refused: tested on the way into a sink, awaited first.
export async function awaitedTested(answer: Response): Promise<string> {
  return JSON.stringify((await answer.json()) || 'fallback');
}

// Refused: a callback's parameter the contract hands one, tested.
export function callback(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key: string, value: unknown) => value ?? null),
  );
}

// Passes: the right operand, a branch, handed on whole into a sink.
export function handedOn(
  answer: IAdtWireResponse,
  flag: boolean,
  given: string | undefined,
): string {
  return [
    JSON.stringify(given || answer.data),
    JSON.stringify(flag && answer.data),
    JSON.stringify(given ?? answer.data),
    JSON.stringify(flag ? answer.data : answer.request),
  ].join('');
}
