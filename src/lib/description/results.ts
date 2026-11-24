/**
 * The result shapes of the tools not on the writers (plan step 10.6): each
 * kind's answer type, every member by its domain noun. The types are the
 * projections' own, so a member added to an answer and not named here does
 * not compile; only the members a terse answer writes are stated.
 */

import type {
  activationResultsAnswer,
  activationStatusAnswer,
} from '../../handlers/common/readonly/handleGetActivationRun';
import type { StatusAnswer } from '../abapGit/formats';
import type { ActivationMessage } from '../strategies/activationRun';
import type {
  PublicationAnswer,
  TerseActivationAnswer,
  terseCheck,
  terseDeletion,
  terseDeletionCheck,
  terseTransportCheck,
  terseValidation,
  terseWrite,
} from '../strategies/projections';
import type { safeCleanup } from '../strategies/safeFields';
import type { storedAt } from '../strategies/tableTypeStored';
import { listOf, resultShape } from './returns';

/** A write's answer: SAP took it. */
export interface WriteAnswer {
  readonly result: NonNullable<ReturnType<typeof terseWrite>>;
}

/** A write's answer under a lock: SAP took it, and a lock its release left held. */
export interface LockedWriteAnswer extends WriteAnswer {
  readonly cleanup?: ReturnType<typeof safeCleanup>;
}

/** A deletion's answer. */
export type DeletionAnswer = NonNullable<ReturnType<typeof terseDeletion>>;

/** A check run's answer. */
export type CheckAnswer = NonNullable<ReturnType<typeof terseCheck>>;

/** A validation's answer. */
export type ValidationAnswer = NonNullable<ReturnType<typeof terseValidation>>;

/** A message of a check or an activation, wherever it stands. */
type SourceMessageOf<A> = A extends {
  readonly messages?: readonly (infer M)[] | undefined;
}
  ? M
  : never;

/** A message SAP gave on a source, by its severity, its words and where it stands. */
const MESSAGE_NOUNS = {
  type: 'its severity',
  text: 'its text',
  object: 'the object it is about',
  uri: 'the source it names',
  position: 'its position there',
  code: "SAP's message code",
} as const;

/** What a write answers. */
export const WRITTEN = resultShape<WriteAnswer>({
  result: 'whether SAP took the change',
});

/** What a write under a lock answers. */
export const WRITTEN_UNDER_LOCK = resultShape<LockedWriteAnswer>({
  result: 'whether SAP took the change',
  cleanup: 'a lock left held when its release failed',
});

/** What a lock held by a server instance answers: its handle, and the instance's. */
export interface HeldLockAnswer {
  readonly lock_handle: string;
  readonly state_handle?: string | undefined;
}

/** What a lock held by a server instance answers. */
export const HELD_LOCK = resultShape<HeldLockAnswer>({
  lock_handle: 'the lock handle its write, delete and unlock take',
  state_handle:
    'the state handle of the instance that holds it: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header)',
});

/** An unlock that released nothing: the lock went with its session, or there was none. */
export interface NotUnlockedAnswer {
  readonly unlocked: false;
  readonly reason: string;
}

/** What an unlock answers. */
export const UNLOCKED = resultShape<WriteAnswer | NotUnlockedAnswer>({
  result: 'whether SAP took the change',
  unlocked: 'that the lock was already released',
  reason: 'why',
});

/** What a deletion answers. */
export const DELETED = resultShape<DeletionAnswer>({
  deleted: 'whether SAP deleted the object',
  object: 'its name',
  message: "SAP's message about it",
});

/** A deletion check's answer. */
type DeletionCheckAnswer = NonNullable<ReturnType<typeof terseDeletionCheck>>;

/** What a deletion check answers: SAP's verdict whether the object can be deleted. */
export const DELETION_CHECKED = resultShape<DeletionCheckAnswer>({
  deletable: 'whether SAP lets the object be deleted',
  object: 'its name',
  message: "SAP's message about it",
});

/** What a read of an activation run's status answers. */
export const ACTIVATION_RUN_STATUS = resultShape<
  ReturnType<typeof activationStatusAnswer>
>({
  run_id: "the run's id",
  part: 'the part read',
  status: "the run's status, finished, error, failed or its progress",
  document: 'its status as SAP gave it',
});

/** What a read of an activation run's results answers. */
export const ACTIVATION_RUN_RESULTS = resultShape<
  ReturnType<typeof activationResultsAnswer>
>({
  run_id: "the run's id",
  part: 'the part read',
  activated: "whether SAP activated it, by the results' verdict",
  nothing_to_activate: 'whether it was already active',
  messages: listOf<ActivationMessage>('for each message of the run', {
    type: 'its severity',
    text: 'its text',
    objectName: 'the object it is about',
    uri: 'the address of that object',
    object: 'the object and its part as SAP describes them',
    source_uri: 'the source it names',
    position: 'its position there',
    code: "SAP's message code",
  }),
  document: 'its results as SAP gave them',
});

/** What a check run answers. */
export const CHECKED = resultShape<CheckAnswer>({
  ran: 'whether the check ran',
  status_text: "SAP's status text",
  messages: listOf<SourceMessageOf<CheckAnswer>>(
    'for each message',
    MESSAGE_NOUNS,
  ),
});

/** What an activation answers. */
export const ACTIVATED = resultShape<TerseActivationAnswer>({
  activated: 'whether SAP activated it',
  generated: 'whether SAP generated it',
  nothing_to_activate: 'whether it was already active',
  messages: listOf<SourceMessageOf<TerseActivationAnswer>>(
    'for each message',
    MESSAGE_NOUNS,
  ),
});

/** What a check run answers with the object it checked named. */
export const CHECKED_NAMED = resultShape<
  CheckAnswer & { readonly object_name: string }
>({
  object_name: 'the object checked',
  ran: 'whether the check ran',
  status_text: "SAP's status text",
  messages: listOf<SourceMessageOf<CheckAnswer>>(
    'for each message',
    MESSAGE_NOUNS,
  ),
});

/** A transport check's answer (a new service binding's validation). */
type TransportCheckAnswer = NonNullable<ReturnType<typeof terseTransportCheck>>;

/** What a transport check answers. */
export const TRANSPORT_CHECKED = resultShape<TransportCheckAnswer>({
  admissible: 'whether SAP admits it',
  result: "SAP's verdict when it is another",
  messages: listOf<{ type: string; text: string }>('for each message', {
    type: 'its severity',
    text: 'its text',
  }),
});

/** What an abapGit write or check answers that SAP answers with no document. */
export const ABAPGIT_STATUS = resultShape<StatusAnswer>({
  status: "SAP's status",
  result: 'whether SAP has done it or accepted it',
});

/** What a validation answers. */
export const VALIDATED = resultShape<ValidationAnswer>({
  admissible: 'whether the name is admissible',
  message: "SAP's message about it",
});

/** What a publication answers, under the binding's lock. */
export const PUBLISHED = resultShape<
  PublicationAnswer & Pick<LockedWriteAnswer, 'cleanup'>
>({
  result: 'whether SAP made the change or started it',
  completion: 'whether it has completed or runs in the background',
  severity: "SAP's severity",
  short_text: "SAP's status text",
  note: 'what a started change means for the service',
  cleanup: 'a lock left held when its release failed',
});

/**
 * The stored definition a table-type write states beside its answer: the
 * version it was read at, or the failed read — the definition itself is a
 * read of its own, stated only at the whole answer.
 */
type StoredStated = Exclude<
  ReturnType<typeof storedAt>,
  undefined | { readonly stored_definition: unknown }
>;

/** What a table-type write answers: the write's, then the stored definition's version. */
export const STORED_TABLE_TYPE = resultShape<LockedWriteAnswer & StoredStated>({
  result: 'whether SAP took the change',
  cleanup: 'a lock left held when its release failed',
  stored_version: 'the version its stored definition was read at',
  stored_definition_not_read: "SAP's failure when that read failed",
});
