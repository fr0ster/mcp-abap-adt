/**
 * One interactive login at a time, across destinations.
 *
 * Every browser strategy's callback listens on the same port, so two first
 * logins would race for it. A settled login has released the port
 * (auth-providers' callback scope settles only once the socket is free), so
 * the next one binds it.
 */

import type {
  AuthorizationOutcome,
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';

export class LoginLock {
  private tail: Promise<void> = Promise.resolve();

  /** Runs `task` once every earlier task has settled, resolved or rejected. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function oneLoginAtATime(
  strategy: IAuthorizationStrategy<string>,
  lock: LoginLock,
): IAuthorizationStrategy<string> {
  const wrapped: IAuthorizationStrategy<string> = {
    authorize: (
      request: AuthorizationRequest,
    ): Promise<AuthorizationOutcome<string>> =>
      lock.run(() => strategy.authorize(request)),
  };
  if (strategy.dispose) {
    wrapped.dispose = () => strategy.dispose?.() ?? Promise.resolve();
  }
  return wrapped;
}
