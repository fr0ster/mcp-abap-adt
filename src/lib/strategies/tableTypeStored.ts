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
import { type AdtReading, parseStructure } from './reading';

/**
 * The definition a table type's document states: the elements the table-type
 * writes change, each as SAP wrote it (its text, verbatim — a length is
 * `000010`, as SAP answers it). An element the document does not hold is not
 * named.
 */
export type StoredTableTypeDefinition = {
  row_type_kind?: string;
  row_type_name?: string;
  data_type?: string;
  length?: string;
  decimals?: string;
  access_type?: string;
  key_definition?: string;
  key_kind?: string;
};

/** `node`'s child `name`, when `node` is a parsed element that holds one. */
function childOf(node: unknown, name: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
  return Reflect.get(node, name);
}

/** A parsed element's text: a bare string, or `#text` beside its attributes. */
function textOfElement(node: unknown): string | undefined {
  if (typeof node === 'string') return node;
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
  const text: unknown = Reflect.get(node, '#text');
  if (typeof text === 'string') return text;
  // An element with attributes and no text (`<ttyp:x a="1"/>`): empty.
  return Object.keys(node).every((key) => key === '@') ? '' : undefined;
}

/**
 * Read the definition a table type's document states (`ttyp:tableType`, as a
 * read of the object answers it). The document is SAP's, from outside the
 * type system: `undefined` when it is not a table type document; an element
 * that is absent, or not a single element with text, is left out.
 */
export function readTableTypeDefinition(
  document: string,
): StoredTableTypeDefinition | undefined {
  const root = childOf(parseStructure(document), 'ttyp:tableType');
  if (typeof root !== 'object' || root === null || Array.isArray(root)) return;
  const rowType = childOf(root, 'ttyp:rowType');
  const builtIn = childOf(rowType, 'ttyp:builtInType');
  const primaryKey = childOf(root, 'ttyp:primaryKey');
  const read: ReadonlyArray<
    readonly [keyof StoredTableTypeDefinition, unknown]
  > = [
    ['row_type_kind', childOf(rowType, 'ttyp:typeKind')],
    ['row_type_name', childOf(rowType, 'ttyp:typeName')],
    ['data_type', childOf(builtIn, 'ttyp:dataType')],
    ['length', childOf(builtIn, 'ttyp:length')],
    ['decimals', childOf(builtIn, 'ttyp:decimals')],
    ['access_type', childOf(root, 'ttyp:accessType')],
    ['key_definition', childOf(primaryKey, 'ttyp:definition')],
    ['key_kind', childOf(primaryKey, 'ttyp:kind')],
  ];
  const stored: StoredTableTypeDefinition = {};
  for (const [field, node] of read) {
    const text = textOfElement(node);
    if (text !== undefined) stored[field] = text;
  }
  return stored;
}

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
