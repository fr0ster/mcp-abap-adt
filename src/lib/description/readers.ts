/**
 * The descriptions of the metadata readers (plan step 10.6, group 4): one
 * shape, "Reads <object> <at>", then either the facts of the reader's typed
 * result (`membersOf`), continuing the purpose, or — for a reader whose
 * answer is SAP's data with no typed reading of ours — what the user gets,
 * named in the purpose, and the fixed fact `sapData`.
 */

import { purpose } from './purpose';
import { type ReturnsFact, sapData } from './returns';
import type { DescriptionParts, DescriptionTag } from './toolDescription';

/** The version a reader reads, as its purpose says it. */
const AT_VERSION_ASKED = 'at the version asked';

/** What a metadata reader reads, and what it gives back. */
export type ReaderParts = {
  readonly tag?: DescriptionTag | undefined;
  /** What is read, in domain words: `an ABAP domain`. */
  readonly object: string;
  /** Which version: `at the version asked` unless stated. */
  readonly at?: string | undefined;
} & (
  | {
      /** The facts of the reader's typed result (`membersOf`). */
      readonly facts: readonly ReturnsFact[];
    }
  | {
      /** What SAP's data holds, for a reader with no typed result: `its data type and length`. */
      readonly holding: string;
    }
);

/**
 * A metadata reader's description parts, for `toolDescription`: `Reads
 * <object> <at>: <facts>.`, or with what SAP's data holds.
 */
export function readerParts(parts: ReaderParts): DescriptionParts {
  const at = parts.at ?? AT_VERSION_ASKED;
  const tag = parts.tag ?? 'read-only';
  if ('facts' in parts) {
    return {
      tag,
      purpose: purpose(`Reads ${parts.object} ${at}.`),
      returns: parts.facts,
      inline: true,
    };
  }
  return {
    tag,
    purpose: purpose(`Reads ${parts.object} ${at}, with ${parts.holding}.`),
    returns: [sapData],
  };
}
