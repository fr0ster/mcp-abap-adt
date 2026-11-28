/**
 * The objects a run created and has not deleted yet (#394, spec §5), with
 * where each stands — so a lost response neither abandons an object nor
 * deletes one twice:
 *
 * - `unconfirmed`: recorded before its create is sent; a create that failed
 *   on the network, unclassified, after a credential refusal or in a lost
 *   session stays so — SAP may have made it;
 * - `exists`: its create was answered `ok`;
 * - `delete-sent`: a delete was sent and not answered `ok` — never sent
 *   again, reported as "deletion unconfirmed".
 *
 * An object leaves the record when its delete is answered `ok` (or `404`
 * for an `unconfirmed` one: it was never made), or when its create is
 * `refused`. One record per run connection (`ownedObjectsOf`).
 */
import type { ToolResultLike } from '../../../lib/toolResult';
import { answerOutcome, type StepOutcome, thrownOutcome } from './stepOutcome';

export type ObjectState = 'unconfirmed' | 'exists' | 'delete-sent';

/** An owned object: what it is, its name, and where it stands. */
export interface OwnedObject {
  readonly kind: string;
  readonly name: string;
  readonly state: ObjectState;
}

/** A call's answer or what it threw, and its outcome. */
export type Sent<T> =
  | { readonly outcome: StepOutcome; readonly answer: T }
  | { readonly outcome: StepOutcome; readonly thrown: unknown };

/** Whether an answer is SAP's `404`: the object is not there. */
function notFound(answer: ToolResultLike): boolean {
  try {
    const payload: unknown = JSON.parse(answer.content?.[0]?.text ?? '');
    return (
      typeof payload === 'object' &&
      payload !== null &&
      Reflect.get(payload, 'status') === 404
    );
  } catch {
    return false;
  }
}

async function send<T extends ToolResultLike>(
  call: () => Promise<T>,
): Promise<Sent<T>> {
  try {
    const answer = await call();
    return { outcome: answerOutcome(answer), answer };
  } catch (thrown) {
    return { outcome: thrownOutcome(thrown), thrown };
  }
}

/** The objects a run connection owns. */
export class OwnedObjects {
  private readonly owned: Array<{
    kind: string;
    name: string;
    state: ObjectState;
  }> = [];

  private find(name: string) {
    return this.owned.find((entry) => entry.name === name);
  }

  private drop(name: string): void {
    const at = this.owned.findIndex((entry) => entry.name === name);
    if (at >= 0) this.owned.splice(at, 1);
  }

  /**
   * Sends a create: the object is recorded `unconfirmed` before it is sent,
   * `exists` on `ok`, dropped on `refused`, and kept `unconfirmed` on any
   * other outcome.
   */
  async create<T extends ToolResultLike>(
    kind: string,
    name: string,
    call: () => Promise<T>,
  ): Promise<Sent<T>> {
    if (this.find(name) === undefined) {
      this.owned.push({ kind, name, state: 'unconfirmed' });
    }
    const sent = await send(call);
    const entry = this.find(name);
    if (entry !== undefined) {
      if (sent.outcome === 'ok') entry.state = 'exists';
      else if (sent.outcome === 'refused') this.drop(name);
    }
    return sent;
  }

  /**
   * Sends a delete — or nothing, when one was already sent: the object is
   * `delete-sent` before it is sent, dropped on `ok` (or a `404` for an
   * `unconfirmed` one), and left `delete-sent` on any other outcome.
   * `undefined` when nothing was sent.
   */
  async delete<T extends ToolResultLike>(
    name: string,
    call: () => Promise<T>,
  ): Promise<Sent<T> | undefined> {
    const entry = this.find(name);
    if (entry?.state === 'delete-sent') return undefined;
    const wasUnconfirmed = entry?.state === 'unconfirmed';
    if (entry !== undefined) entry.state = 'delete-sent';
    const sent = await send(call);
    const gone =
      sent.outcome === 'ok' ||
      (wasUnconfirmed && 'answer' in sent && notFound(sent.answer));
    if (gone) this.drop(name);
    return sent;
  }

  /** Records an object made outside `create` (one already confirmed). */
  exists(kind: string, name: string): void {
    if (this.find(name) === undefined) {
      this.owned.push({ kind, name, state: 'exists' });
    }
  }

  /** The objects still owned, in creation order. */
  get stillOwned(): readonly OwnedObject[] {
    return this.owned.map((entry) => ({ ...entry }));
  }

  /** The names still owned of `kind`, newest first. */
  newestFirst(kind: string): readonly string[] {
    return this.owned
      .filter((entry) => entry.kind === kind)
      .map((entry) => entry.name)
      .reverse();
  }
}

const records = new WeakMap<object, OwnedObjects>();

/** The record of `connection`: one per run connection, made on first use. */
export function ownedObjectsOf(connection: object): OwnedObjects {
  const found = records.get(connection);
  if (found !== undefined) return found;
  const made = new OwnedObjects();
  records.set(connection, made);
  return made;
}

/** The record of `connection` if it has one. */
export function ownedObjectsIfAny(
  connection: object,
): OwnedObjects | undefined {
  return records.get(connection);
}
