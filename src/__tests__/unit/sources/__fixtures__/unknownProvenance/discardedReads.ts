// The closed rule, discarded reads: a read of a third party's `unknown` or
// `any` whose value is thrown away — a statement of its own, `void` — is a
// read all the same, refused in every read form.
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

// Refused: a member read by name, by a key, through an optional chain.
export function members(answer: IAdtWireResponse | undefined): void {
  answer?.data;
  void answer?.request;
  answer?.['data'];
}

// Refused: a call answering one, discarded, awaited or not.
export async function calls(text: string, answer: Response): Promise<void> {
  JSON.parse(text);
  void JSON.parse(text);
  await answer.json();
}

// Refused: a callback's parameter the contract hands one, used only discarded.
export function callback(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key: string, value: unknown) => {
      value;
      return 0;
    }),
  );
}
