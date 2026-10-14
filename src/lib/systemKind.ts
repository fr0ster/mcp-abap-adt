/** The kinds of system a connection dials. */
export type AbapSystemKind = 'onprem' | 'cloud';

/**
 * The system kind a stated value names: `cloud`, or `onprem` for `onprem`
 * and `legacy` (an on-premise system, just an older one); `undefined` for
 * none or any other value.
 */
export function statedSystemKind(
  value: string | undefined,
): AbapSystemKind | undefined {
  const declared = value?.trim().toLowerCase();
  if (declared === 'cloud') return 'cloud';
  if (declared === 'onprem' || declared === 'legacy') return 'onprem';
  return undefined;
}
