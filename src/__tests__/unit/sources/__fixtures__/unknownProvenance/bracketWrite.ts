// Round 8: a member written by a bracket key is the member: `box['value']`
// writes `Box.value` as `box.value` does.
interface Box {
  value: unknown;
}

export function written(text: string): Box {
  const box: Box = { value: JSON.parse(text) };
  box['value'] = 42;
  return box;
}
