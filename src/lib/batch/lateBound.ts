/**
 * The connection an open batch's `AdtBatchConnection` wraps: a late-bound
 * target whose every member forwards to the connection it is pointed at now.
 *
 * The instance's connection object may be replaced between recording and
 * `BatchEnd` (a session SAP ended) and the replaced one
 * ends with its logoff, so the batch never holds a connection of its own.
 * The owner points the target: during a recording call's turn at the
 * connection that call took (what `connect()` / `getBaseUrl()` /
 * `getSessionId()` of the batch connection reach while recording), at
 * `BatchEnd` at the connection `BatchEnd` took — and clears it after. A
 * dropped batch seals it (`seal()`): it points at nothing from then on, so
 * an `execute()` running at the drop sends no further envelope.
 *
 * It sends nothing of its own: `makeAdtRequest` is reached only from the
 * batch connection's `execute()` (the envelopes), and the session members
 * forward so the stateful LOCK/UNLOCK envelopes run on, and are restored
 * on, the connection in force.
 *
 * An envelope goes out through the pointed connection's `makeAdtRequest`.
 * What SAP answers to an envelope reaches `execute()` as it came; the
 * connection's own handling (credential, CSRF, session) stays.
 */
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';

type Session = 'stateful' | 'stateless';

/** What an optional session member of a connection may answer. */
interface SessionAware {
  getSessionType?: () => Session | undefined;
  getSessionMode?: () => Session | undefined;
}

/** A member reached while the target points at no connection. */
export const LATE_BOUND_UNPOINTED_WORDS =
  'the batch connection points at no connection now: nothing was sent';

/** A member reached after the batch was dropped. */
export const LATE_BOUND_DROPPED_WORDS =
  'the batch was dropped: nothing more was sent';

export class LateBoundConnection implements IAbapConnection {
  private current: IAbapConnection | undefined;
  private sealed = false;

  /** Points the target at `connection`; `undefined` clears it. Sealed, it stays cleared. */
  point(connection: IAbapConnection | undefined): void {
    if (this.sealed) return;
    this.current = connection;
  }

  /** The batch was dropped: the target is cleared for good. */
  seal(): void {
    this.sealed = true;
    this.current = undefined;
  }

  private target(): IAbapConnection {
    const current = this.current;
    if (current === undefined) {
      throw new Error(
        this.sealed ? LATE_BOUND_DROPPED_WORDS : LATE_BOUND_UNPOINTED_WORDS,
      );
    }
    return current;
  }

  async connect(): Promise<void> {
    return this.target().connect();
  }

  async getBaseUrl(): Promise<string> {
    return this.target().getBaseUrl();
  }

  getSessionId(): string | null {
    return this.current?.getSessionId() ?? null;
  }

  setSessionType(type: Session): void {
    this.target().setSessionType(type);
  }

  getSessionType(): Session | undefined {
    return (this.current as SessionAware | undefined)?.getSessionType?.();
  }

  getSessionMode(): Session | undefined {
    return (this.current as SessionAware | undefined)?.getSessionMode?.();
  }

  async makeAdtRequest<T = unknown, D = unknown>(
    options: IAbapRequestOptions,
  ): Promise<IAdtWireResponse<T, D>> {
    return this.target().makeAdtRequest<T, D>(options);
  }
}
