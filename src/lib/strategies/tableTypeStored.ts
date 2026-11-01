/**
 * The definition SAP stored for a table type, answered by the table-type
 * writes beside their result: a success, and a failure after the wait (a
 * refused check or activation) alike (`AnswerContext.beside`).
 *
 * SAP takes a definition and stores other values than those sent (measured
 * on premise, 2026-11-01: a hashed access forces a unique key, a standard
 * one turns a unique key non-unique, an index access forces an unspecified
 * key, an unlisted value is answered SUCCESS and something else is stored).
 * So the writes answer what SAP stored, read at a stated version, named
 * under `stored_version`: after a successful activation, one read of the
 * active version; otherwise the document the chain already reads, the
 * long-polling wait after the unlock, of the inactive version.
 *
 * When that read answered no table type document — a refusal, a throw, an
 * empty body — the answer says the stored definition was not read, with
 * SAP's answer: never the values sent in its place.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  type FailureEntry,
  failureEntry,
  isCredentialFailure,
  thrownEntry,
} from '../answer';
import type { ReadVersion } from '../handlers/readVersion';
import type { AnswerDetail } from './projections';
import type { AdtReading } from './reading';
import {
  readTableTypeDefinition,
  type StoredTableTypeDefinition,
} from './tableTypePatch';

/** The step a failed read of the stored definition names. */
const STEP = 'read stored definition';

/** What the answer says of the stored definition, and the version read. */
export type StoredDefinitionAnswer = {
  readonly stored_version: ReadVersion;
} & (
  | { readonly stored_definition: StoredTableTypeDefinition }
  | { readonly stored_definition_not_read: FailureEntry }
);

/**
 * Run a read of the stored definition at `version` and say what it answered,
 * naming the version. A
 * credential failure is rethrown as it came (every further request would be
 * refused again, so the call ends with it); any other failure is the
 * answer's `stored_definition_not_read`.
 */
export async function readStoredDefinition<T>(
  read: () => Promise<IAdtResponse<AdtReading<T>, IAdtError>>,
  version: ReadVersion,
  detail: AnswerDetail,
): Promise<StoredDefinitionAnswer> {
  let answered: IAdtResponse<AdtReading<T>, IAdtError>;
  try {
    answered = await read();
  } catch (thrown) {
    if (isCredentialFailure(thrown)) throw thrown;
    return {
      stored_version: version,
      stored_definition_not_read: thrownEntry(thrown, STEP),
    };
  }
  if (!answered.ok) {
    return {
      stored_version: version,
      stored_definition_not_read: failureEntry(
        answered.getError(),
        STEP,
        detail,
      ),
    };
  }
  const reading = answered.getResult().value;
  const stored = readTableTypeDefinition(reading.raw);
  if (stored === undefined) {
    return {
      stored_version: version,
      stored_definition_not_read: {
        message: 'The read after the write answered no table type document.',
        step: STEP,
        status: reading.status,
        raw_body: reading.raw,
      },
    };
  }
  return { stored_version: version, stored_definition: stored };
}
