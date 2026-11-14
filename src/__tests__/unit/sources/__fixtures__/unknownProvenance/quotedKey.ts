// A member written by a quoted key is the member: its value reaches the slot.
interface Reading {
  readonly 'raw-value': unknown;
}

function readBack(held: Reading): boolean {
  return typeof held['raw-value'] === 'number';
}

export function quoted(): boolean {
  return readBack({ 'raw-value': 42 });
}
