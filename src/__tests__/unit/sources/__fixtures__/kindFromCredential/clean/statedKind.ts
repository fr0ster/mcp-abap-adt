// Clean: a kind from a stated value, a plain string — not a credential read.
export function statedKind(
  value: string | undefined,
): 'cloud' | 'onprem' | 'legacy' | undefined {
  const declared = value?.trim().toLowerCase();
  return declared === 'cloud' || declared === 'onprem' || declared === 'legacy'
    ? declared
    : undefined;
}
