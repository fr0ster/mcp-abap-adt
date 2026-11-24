/**
 * The descriptions of the readers whose answer is not written by a listing
 * writer (plan 10.6): the source readers (`sourceReader`), and the facts of
 * any typed answer, member by member (`membersOf`).
 */

import type { IObjectVersion } from '@mcp-abap-adt/adt-strategies';
import { headShape } from '../detail';
import type { ReadVersion } from '../handlers/readVersion';
import type { SourceCut } from '../handlers/sourceRange';
import type { Note } from './notes';
import { type Purpose, purpose } from './purpose';
import { type ReturnsFact, returnsOf } from './returns';
import type { DescriptionParts } from './toolDescription';

/**
 * The domain noun of every member of an answer `T`, by the member's name:
 * a member added to `T` and left out here does not compile.
 */
export type MemberNouns<T> = { readonly [K in keyof T]-?: string };

/**
 * One fact of an answer's members: `of`, then the noun of each member in
 * the order given (`for each version: its ID, its author and …`).
 */
export function membersOf<T>(of: string, nouns: MemberNouns<T>): ReturnsFact[] {
  return returnsOf({
    of,
    heads: Object.entries<string>(nouns).map(([member, noun]) =>
      headShape(member, noun),
    ),
    shapes: [],
  });
}

/** What a source read answers beside the object's name. */
export interface SourceReadAnswer {
  readonly source: string;
  readonly version: ReadVersion;
}

/** The range a ranged source read answers beside the lines it cut. */
type RangeAnswer = Omit<SourceCut, 'text'>;

const SOURCE_NOUNS: MemberNouns<SourceReadAnswer> = {
  source: 'source code',
  version: 'the version read',
};

const RANGE_NOUNS: MemberNouns<RangeAnswer> = {
  start_line: 'where it starts',
  end_line: 'where it ends',
  line_count: 'the length of the whole source',
};

/** The metadata a reader of `part` metadata answers, as SAP keeps it. */
const METADATA_NOUNS: MemberNouns<{ readonly metadata: string }> = {
  metadata: 'its metadata: its package, person responsible and description',
};

/** A source reader: what it reads, and which members its answer carries. */
export interface SourceReader {
  /** The object read, with its article: `an ABAP class`. */
  readonly object: string;
  /** Its own purpose, when its function says more than reading a source. */
  readonly purpose?: Purpose | undefined;
  /** The members of its answer: the source alone, or with the version read. */
  readonly answers?: 'source' | 'source-and-version' | undefined;
  /** A line range: answered with its lines and count, or the lines alone. */
  readonly range?: 'with-count' | 'lines' | undefined;
  /** It reads the object's metadata too, by `part`. */
  readonly metadata?: boolean | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/**
 * A source reader's description parts: "Reads the source of <object> at the
 * version asked", then the facts of its answer's members.
 */
export function sourceReader(reader: SourceReader): DescriptionParts {
  const answers = reader.answers ?? 'source-and-version';
  const sourceNouns: MemberNouns<Pick<SourceReadAnswer, 'source'>> = {
    source: SOURCE_NOUNS.source,
  };
  return {
    tag: 'read-only',
    purpose:
      reader.purpose ??
      purpose(
        `Reads the source of ${reader.object} at the version asked${reader.metadata === true ? ', or its metadata' : ''}.`,
      ),
    returns: [
      ...(answers === 'source'
        ? membersOf('its', sourceNouns)
        : membersOf('its', SOURCE_NOUNS)),
      ...(reader.range === 'with-count'
        ? membersOf(
            'with a range asked, only that part of the source:',
            RANGE_NOUNS,
          )
        : reader.range === 'lines'
          ? membersOf<Pick<SourceReadAnswer, 'source'>>('with a range asked,', {
              source: 'only that part of the source',
            })
          : []),
      ...(reader.metadata === true
        ? membersOf('or, when asked,', METADATA_NOUNS)
        : []),
    ],
    notes: reader.notes,
  };
}

/** What a version source read answers. */
export interface VersionSourceAnswer {
  readonly content_uri: string;
  readonly source: string;
}

const VERSION_SOURCE_NOUNS: MemberNouns<VersionSourceAnswer> = {
  content_uri: 'reference of the version read',
  source: 'its source code',
};

/**
 * A version source reader's description parts: "Reads the source of one version
 * of <object>, from its version history", then its answer's members.
 */
export function versionSourceReader(object: string): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(
      `Reads the source of one version of ${object}, from its version history.`,
    ),
    returns: membersOf('the', VERSION_SOURCE_NOUNS),
  };
}

const VERSION_NOUNS: MemberNouns<IObjectVersion> = {
  versionId: 'its ID',
  author: 'its author',
  updatedAt: 'when it was saved',
  title: 'its title',
  contentUri: 'the reference that reads its source',
  transportRequest: 'the transport that produced it',
  transportDescription: "that transport's description",
};

/**
 * A version history reader's description parts: "Lists the version history of
 * <object>", then each version's members.
 */
export function versionHistoryReader(object: string): DescriptionParts {
  return {
    tag: 'read-only',
    purpose: purpose(`Lists the version history of ${object}.`),
    returns: membersOf('for each version:', VERSION_NOUNS),
  };
}
