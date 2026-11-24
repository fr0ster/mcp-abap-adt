/**
 * The descriptions of the source readers (plan step 10.6, group 3): what is
 * read, at the version asked — the function alone (owner: a description is
 * purely functional).
 */

import type { Note } from './notes';
import { type Purpose, purpose } from './purpose';
import type { DescriptionParts } from './toolDescription';

/** A source reader: what it reads. */
export interface SourceReader {
  /** The object read, with its article: `an ABAP class`. */
  readonly object: string;
  /** Its own purpose, when its function says more than reading a source. */
  readonly purpose?: Purpose | undefined;
  /** It reads the object's metadata too, by `part`. */
  readonly metadata?: boolean | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** A source reader's description parts: "Reads the source of <object> at the version asked". */
export function sourceReader(reader: SourceReader): DescriptionParts {
  return {
    tag: 'read-only',
    purpose:
      reader.purpose ??
      purpose(
        `Reads the source of ${reader.object} at the version asked${reader.metadata === true ? ', or its metadata' : ''}.`,
      ),
    notes: reader.notes,
  };
}

/** A version source reader: "Reads the source of one version of <object>, from its version history". */
export function versionSourceReader(object: string): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(
      `Reads the source of one version of ${object}, from its version history.`,
    ),
  };
}

/** A version history reader: "Lists the version history of <object>". */
export function versionHistoryReader(object: string): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(`Lists the version history of ${object}.`),
  };
}
