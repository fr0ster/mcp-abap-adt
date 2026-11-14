// Library callbacks: called only by a contract outside the repository, which
// types the value `any`.
export function later(work: Promise<string>): Promise<string> {
  return work.catch((reason: unknown) => String(reason));
}

export function revive(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown) => value);
}
