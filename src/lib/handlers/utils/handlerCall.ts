import type { HandlerContext } from '../../../handlers/interfaces.js';
import { runWithCallTransport } from '../../callTransport.js';
import { admitOnKind } from '../../connectionFactory.js';
import { withResolvedSystemContext } from '../../requestSystemResolution.js';
import { statedSystemKind, stateSystemKind } from '../../systemKind.js';
import type { ToolArgs } from '../interfaces.js';

/**
 * The context one call of a registered tool runs in, asked for when the
 * call comes: a group's own (`registerHandlers`), or one made for the call
 * (`HandlerExporter.registerOnServer`, on the connection its provider
 * returns). A rejection is the call's answer; the handler does not run.
 */
export type CallContext = () => Promise<HandlerContext>;

/** What a call's scope reads of its context. */
export type StatedScope = Pick<
  HandlerContext,
  'systemType' | 'systemContextResolver' | 'systemContextRules'
> & {
  readonly connection: HandlerContext['connection'] | null | undefined;
};

/**
 * Runs `fn` — a handler's call on a connection a server did not hand it —
 * in the scope every such path gives it: the kind `scope.systemType` states,
 * stated on the connection (none stated, none: `SAP_SYSTEM_TYPE` is not read
 * for it, `stateSystemKind`); the call-transport scope with the call's own
 * `transport_request` (the failure renderer's transport hint); and, with a
 * resolver, the connection's parameters made before it runs (a credential
 * failure or a refusal of the rules is thrown, and `fn` does not run).
 */
export function inStatedScope<T>(
  scope: StatedScope,
  args: ToolArgs,
  fn: () => Promise<T>,
): Promise<T> {
  const { connection } = scope;
  if (connection) {
    // A connection the factory built keeps the kind it was built for: a
    // handler stated for another kind is refused, never run on either.
    // One kind: the one stated. A connection built for another (the
    // factory's record) or declared for another (`declareSystemKind`) is
    // refused, never run on either.
    const conflict = admitOnKind(
      connection,
      statedSystemKind(scope.systemType),
    );
    if (conflict !== undefined) return Promise.reject(conflict);
    stateSystemKind(connection, scope.systemType);
  }
  return runWithCallTransport(args, () =>
    withResolvedSystemContext(
      connection,
      fn,
      scope.systemContextResolver ?? null,
      scope.systemType,
      scope.systemContextRules ?? null,
    ),
  );
}
