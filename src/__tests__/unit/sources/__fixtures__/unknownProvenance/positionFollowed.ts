// A value followed to where it was made is read there at the position the
// site asks for: a generic reading's `value`, made from a parse.
export interface Reading<T> {
  readonly value: T;
  readonly raw: string;
}

function valueOf(heldReading: Reading<unknown>): boolean {
  return heldReading.value !== null && heldReading.raw !== '';
}

function relay<T>(reading: Reading<T>): boolean {
  return valueOf(reading);
}

export function relayParsed(text: string): boolean {
  const parsed: unknown = JSON.parse(text);
  return relay({ value: parsed, raw: text });
}
