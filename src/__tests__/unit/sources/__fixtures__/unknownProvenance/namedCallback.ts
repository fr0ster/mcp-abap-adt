// A named function handed on as a callback is judged by the contracts it is
// handed to, as an inline one is: open where the contract types the value
// `any`, refused where it has a type.
function readBack(namedValue: unknown): number {
  return typeof namedValue === 'number' ? namedValue + 1 : 0;
}

export function later(): Promise<number> {
  return Promise.resolve(42).then(readBack);
}

function revive(_key: string, revived: unknown): unknown {
  return revived;
}

export function parsed(text: string): unknown {
  return JSON.parse(text, revive);
}
