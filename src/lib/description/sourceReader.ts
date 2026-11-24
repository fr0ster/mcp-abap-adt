/**
 * The descriptions of the source readers (plan step 10.6, group 3): what is
 * read — the function alone (owner: a description is
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

/** A source reader's description parts: "Reads the current source code of <object>". */
export function sourceReader(reader: SourceReader): DescriptionParts {
  return {
    tag: 'read-only',
    purpose:
      reader.purpose ??
      purpose(
        `Reads the current source code of ${reader.object}${reader.metadata === true ? ', or its metadata' : ''}.`,
      ),
    notes: reader.notes,
  };
}

/** A version source reader: "Reads an older version of <object>'s source from its version history". */
export function versionSourceReader(object: string): DescriptionParts {
  // One named object takes the possessive; a list, or `a CDS view (DDL
  // source)`, takes `the source of`.
  const source =
    object.endsWith(')') || object.includes(',')
      ? `the source of ${object}`
      : `${object}'s source`;
  return {
    tag: 'read-only',
    purpose: purpose(
      `Reads an older version of ${source} from its version history.`,
    ),
  };
}

/** A version history reader: "Lists the version history of <object>". */
export function versionHistoryReader(object: string): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(`Reads the version history of ${object}.`),
  };
}
