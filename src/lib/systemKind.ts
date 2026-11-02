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
 * The system kind stated for a connection someone other than the factory
 * built: by a server (`declareSystemKind`, its `systemType` option, as it
 * hands the connection to a tool) or by a handler group registered on a
 * plain McpServer (`stateSystemKind`, its context's `systemType`). `none`:
 * the group stated no kind — the connection has none, and nothing else
 * (`SAP_SYSTEM_TYPE` above all) is read for it. A connection the factory
 * built keeps the kind it was built for (`systemKindOf` reads that first).
 */
const declaredKinds = new WeakMap<object, AbapSystemKind | 'none'>();

/**
 * Records the kind `declared` states for `connection` — a server's
 * `systemType` option, for a connection it hands a tool. A value that states
 * no kind records nothing: the server's `SAP_SYSTEM_TYPE` then decides
 * (`systemKindOf`).
 */
export function declareSystemKind(
  connection: object,
  declared: string | undefined,
): void {
  const kind = statedSystemKind(declared);
  if (kind !== undefined) declaredKinds.set(connection, kind);
}

/**
 * Records what a handler group registered on a plain McpServer states for
 * `connection` (its context's `systemType`): the kind, or — stating none —
 * that it has none. Either way the environment is not read for it: an
 * embedded library takes no configuration from the environment.
 */
export function stateSystemKind(
  connection: object,
  stated: string | undefined,
): void {
  declaredKinds.set(connection, statedSystemKind(stated) ?? 'none');
}

/**
 * What was declared or stated for `connection`: its kind, `none` (a plain
 * registration stated none), or `undefined` when nothing was.
 */
export function declaredSystemKindOf(
  connection: object,
): AbapSystemKind | 'none' | undefined {
  return declaredKinds.get(connection);
}
