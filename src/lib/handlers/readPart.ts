/**
 * `part` of a `Get<Type>` read: which one document the call reads — the
 * source (`source/main`, the default) or the ADT metadata document (the
 * object's own URI). One request either way, and the answer carries only the
 * document asked for.
 */

import * as z from 'zod';

export type ReadPart = 'source' | 'metadata';

/** The `part` property of a `Get<Type>` input schema. */
const READ_PART_WORDS =
  'The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).';

/** The `part` field of a `Get<Type>` zod input schema. */
export const READ_PART_FIELD = z
  .enum(['source', 'metadata'])
  .default('source')
  .optional()
  .describe(READ_PART_WORDS);

/** The part a call asked for: `source` when it named none. */
export function readPartOf(part: ReadPart | undefined): ReadPart {
  return part ?? 'source';
}
