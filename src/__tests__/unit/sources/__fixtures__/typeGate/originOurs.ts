// The origin report, OURS: an `unknown` written here, at its own line.
export function written(value: unknown): string {
  return String(value);
}

export type Bag = Readonly<Record<string, unknown>>;
