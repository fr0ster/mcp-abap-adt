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

/**
 * The system kind a server states for a connection it did not build (an
 * embedder's own, a handler group's context): its `systemType` option, as
 * it handed the connection to a tool (`declareSystemKind`). A connection the
 * factory built keeps the kind it was built for (`systemKindOf` reads that
 * first).
 */
const declaredKinds = new WeakMap<object, AbapSystemKind>();

/**
 * Records the kind `declared` states for `connection` — a server's
 * `systemType` option, for a connection it hands a tool. A value that states
 * no kind records nothing.
 */
export function declareSystemKind(
  connection: object,
  declared: string | undefined,
): void {
  const kind = statedSystemKind(declared);
  if (kind !== undefined) declaredKinds.set(connection, kind);
}

/** The kind declared for `connection` (`declareSystemKind`), if any. */
export function declaredSystemKindOf(
  connection: object,
): AbapSystemKind | undefined {
  return declaredKinds.get(connection);
}
