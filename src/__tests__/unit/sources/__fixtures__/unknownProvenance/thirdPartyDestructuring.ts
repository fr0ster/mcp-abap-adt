// The closed rule, destructuring: a member a declaration outside the
// repository types `unknown` or `any`, read by any destructuring — a
// variable's, a parameter's, an assignment's, nested, renamed, with a
// default, by a rest — is refused outside a boundary.
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

export function variable(answer: IAdtWireResponse): boolean {
  const { data } = answer;
  return data === undefined;
}

export function renamed(answer: IAdtWireResponse): boolean {
  const { data: body = '' } = answer;
  return body === '';
}

export function nested(holder: { answer: IAdtWireResponse }): boolean {
  const {
    answer: { request },
  } = holder;
  return request === undefined;
}

export function parameter({ data }: IAdtWireResponse): boolean {
  return data === undefined;
}

export function assigned(answer: IAdtWireResponse): boolean {
  let body: unknown;
  ({ data: body } = answer);
  return body === undefined;
}

export function rest(answer: IAdtWireResponse): number {
  const { status, ...others } = answer;
  return status + Object.keys(others).length;
}

export function inCallback(answers: readonly IAdtWireResponse[]): number {
  return answers.filter(({ data }) => data === undefined).length;
}

// Typed members alone: nothing read.
export function typed(answer: IAdtWireResponse): number {
  const { status, statusText } = answer;
  return status + statusText.length;
}
