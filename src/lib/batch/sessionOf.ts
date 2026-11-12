import { hasMethod } from '../capability';

/** An ADT session mode. */
export type Session = 'stateful' | 'stateless';

/**
 * The session a connection states through `member`, a member beyond
 * IAbapConnection (`hasMethod`): `undefined` when it has none, or answers
 * something that is not a session mode.
 */
export function sessionOf(
  connection: unknown,
  member: 'getSessionType' | 'getSessionMode',
): Session | undefined {
  if (!hasMethod(connection, member)) return undefined;
  const session = connection[member]();
  return session === 'stateful' || session === 'stateless'
    ? session
    : undefined;
}
