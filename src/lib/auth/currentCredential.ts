/**
 * The credential a held connection presents: the latest one its instance
 * was given. A pooled HTTP instance keeps one SAP session across requests,
 * and each request carries its own credential — a renewed token, a new
 * basic pair — for the same user. The connection is built once with this
 * credential; `take` puts the request's credential in force, and from then
 * on every moment the connection asks for goes to it. If it is not right,
 * SAP answers, and that answer reaches the caller as it came.
 *
 * Each of the four moments runs inside `AuthProviderBase`'s boundary: what
 * the credential in force answers is handed on, and a throw becomes a
 * refusal — nothing crosses the contract. A credential put in force after
 * the connect is prepared before its first logon or request, once.
 */

import { AuthProviderBase } from '@mcp-abap-adt/auth-providers';
import type {
  AuthOutcome,
  IAuthProvider,
  IAuthRejection,
  ILogonTarget,
  IRequestTarget,
} from '@mcp-abap-adt/interfaces-auth';

export class CurrentCredential extends AuthProviderBase {
  #current: IAuthProvider;
  /** The credentials whose `prepare()` answered Ok. */
  readonly #prepared = new WeakSet<IAuthProvider>();

  constructor(credential: IAuthProvider) {
    super({
      prepare: 'preparing',
      establish: 'establishing',
      authorize: 'authorizing',
      rejected: 'reading-rejection',
    });
    this.#current = credential;
  }

  /** The kind of the credential in force (what the connection logs). */
  get kind(): string {
    try {
      const kind = (this.#current as { kind?: unknown }).kind;
      return typeof kind === 'string' ? kind : 'credential';
    } catch {
      return 'credential';
    }
  }

  /** The credential in force from now on. */
  take(credential: IAuthProvider): void {
    this.#current = credential;
  }

  /** The credential in force. */
  get inForce(): IAuthProvider {
    return this.#current;
  }

  protected async onPrepare(): Promise<AuthOutcome> {
    return this.prepared(this.#current);
  }

  protected async onEstablish(logon: ILogonTarget): Promise<AuthOutcome> {
    const credential = this.#current;
    const ready = await this.prepared(credential);
    if (!ready.ok) return ready;
    return credential.establish(logon);
  }

  protected async onAuthorize(request: IRequestTarget): Promise<AuthOutcome> {
    const credential = this.#current;
    const ready = await this.prepared(credential);
    if (!ready.ok) return ready;
    return credential.authorize(request);
  }

  /**
   * The rejection goes to the credential in force when it arrives — the
   * newest the instance was given, which the next send presents.
   */
  protected onRejected(rejection: IAuthRejection): Promise<AuthOutcome> {
    return this.#current.rejected(rejection);
  }

  /** `credential` prepared: once, when its `prepare()` answers Ok. */
  private async prepared(credential: IAuthProvider): Promise<AuthOutcome> {
    if (this.#prepared.has(credential)) return { ok: true };
    const outcome = await credential.prepare();
    if (outcome.ok) this.#prepared.add(credential);
    return outcome;
  }
}
