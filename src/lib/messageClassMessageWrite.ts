/**
 * The write of one message of a message class, composed from adt-clients 48's
 * one-request members as `docs/usage/MIGRATION-48.md` ("A message class
 * message is four members") gives it — the chain the library's `create`,
 * `update` and `delete` ran before 48:
 *
 * 1. the class document, read at the working area;
 * 2. `lockMessage` — a `403` means the message cannot be locked on its own,
 *    and the class's handle stands in for its own;
 * 3. `lockClassForMessage` — on a `403`, the class's plain `lock`;
 * 4. the PUT of the class document under both handles (`update`; a removal
 *    with `removeMessage: true`), the one answer `analyse` judges;
 * 5. the class's `unlock`, then `unlockMessages` — the class first, as
 *    Eclipse does.
 *
 * The locks and unlocks run on the stateful session and the PUT stateless:
 * each member switches the session itself (adt-clients 48). Every lock still
 * held is given up on every way out — a failed answer, a throw — newest
 * first, whatever an earlier release threw, and the first error thrown is the
 * one that leaves.
 */
import {
  messageClassDocuments,
  messageDocuments,
} from '@mcp-abap-adt/adt-clients';
import type {
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from './adtClientContract';

/** Forbidden: the message lock refused, its handle replaced by the class's. */
const FORBIDDEN = 403;

/** The handles and the document the PUT is sent with. */
export interface MessageWindow {
  readonly classDocument: string;
  readonly classLockHandle: string;
  readonly messageLockHandle: string;
}

/** The message's members, as the server's client answers them. */
export type MessageApi = ReturnType<IServerAdtClient['getMessageClassMessage']>;

/** What the window answers: the PUT's answer, or the failure that ended it. */
type WindowAnswer<R> = R | IAdtFailure;

/**
 * Run `put` inside the message's lock window: read, lock, put, unlock, and
 * release on every way out whatever is still held. `put` is the caller's
 * `update` — an upsert, or a removal with `removeMessage: true` — sent with
 * the window's document and handles and the pair `withAdtHeaders` hands it.
 */
export async function inMessageClassMessageWindow<
  R extends IAdtResponse<unknown, IAdtError>,
>(
  client: IServerAdtClient,
  address: { readonly className: string; readonly msgno: string },
  put: (message: MessageApi, window: MessageWindow) => Promise<R>,
): Promise<WindowAnswer<R>> {
  const messageClass = client.getMessageClass(messageClassDocuments);
  const message = client.getMessageClassMessage(messageDocuments);
  const classAddress = { name: address.className };

  const read = await messageClass.readMetadata(classAddress, {
    version: 'workingArea',
  });
  if (!read.ok) return read;
  const classDocument = read.getResult().value;

  const messageLock = await message.lockMessage(address);
  if (
    !messageLock.ok &&
    messageLock.getError().response?.status !== FORBIDDEN
  ) {
    return messageLock;
  }
  // The locks held, newest last: each is given up on every way out — an
  // answer that failed, a credential refusal thrown — the class first, then
  // the message.
  const held: Array<() => Promise<unknown>> = [
    () => message.unlockMessages(address),
  ];
  const window = async (): Promise<WindowAnswer<R>> => {
    let classLock = await message.lockClassForMessage(address);
    if (!classLock.ok && classLock.getError().response?.status === FORBIDDEN) {
      classLock = await messageClass.lock(classAddress);
    }
    if (!classLock.ok) return classLock;
    const classLockHandle = classLock.getResult().value;
    held.push(() => messageClass.unlock(classAddress, classLockHandle));
    const written = await put(message, {
      classDocument,
      classLockHandle,
      messageLockHandle: messageLock.ok
        ? messageLock.getResult().value
        : classLockHandle,
    });
    if (!written.ok) return written;
    const classUnlocked = await messageClass.unlock(
      classAddress,
      classLockHandle,
    );
    if (!classUnlocked.ok) return classUnlocked; // given up again below
    held.pop();
    const messageUnlocked = await message.unlockMessages(address);
    if (!messageUnlocked.ok) return messageUnlocked; // given up again below
    held.pop();
    return written;
  };

  let outcome: { answer: WindowAnswer<R> } | { error: unknown };
  try {
    outcome = { answer: await window() };
  } catch (error) {
    outcome = { error };
  }
  // Every lock still held is given up, newest first, whatever an earlier one
  // threw; the first error thrown — the window's, else a cleanup's — leaves.
  let thrown: { error: unknown } | undefined =
    'error' in outcome ? outcome : undefined;
  for (const release of held.reverse()) {
    try {
      await release();
    } catch (error) {
      thrown ??= { error };
    }
  }
  if (thrown) throw thrown.error;
  if ('error' in outcome) throw outcome.error;
  return outcome.answer;
}
