/**
 * The descriptions of the metadata readers (plan step 10.6, group 4): one
 * shape, "Reads <object> <at>", with what SAP's data holds where the reader
 * names it — the function alone (owner: a description is purely functional).
 */

import { purpose } from './purpose';
import type { DescriptionParts, DescriptionTag } from './toolDescription';

/** The version a reader reads, as its purpose says it. */
const AT_VERSION_ASKED = 'at the version asked';

/** What a metadata reader reads. */
export interface ReaderParts {
  readonly tag?: DescriptionTag | undefined;
  /** What is read, in domain words: `an ABAP domain`. */
  readonly object: string;
  /** Which version: `at the version asked` unless stated. */
  readonly at?: string | undefined;
  /** What the object read holds, when the purpose names it: `its data type and length`. */
  readonly holding?: string | undefined;
}

/** A metadata reader's description parts: `Reads <object> <at>[, with <holding>].` */
export function readerParts(parts: ReaderParts): DescriptionParts {
  const at = parts.at ?? AT_VERSION_ASKED;
  return {
    tag: parts.tag ?? 'read-only',
    purpose: purpose(
      `Reads ${parts.object} ${at}${parts.holding === undefined ? '' : `, with ${parts.holding}`}.`,
    ),
  };
}
