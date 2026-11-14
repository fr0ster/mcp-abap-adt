// A boundary value written by shorthand: `{ id }` writes the variable `id`,
// which plain code narrowed from parsed text.
export interface Answer {
  readonly id: unknown;
}

export function answerOf(text: string): Answer | undefined {
  const parsed: unknown = JSON.parse(text);
  const id =
    typeof parsed === 'object' && parsed !== null && 'id' in parsed
      ? parsed.id
      : undefined;
  return id === undefined ? undefined : { id };
}
