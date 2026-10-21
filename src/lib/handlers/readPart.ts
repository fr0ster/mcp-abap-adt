/**
 * `part` of a `Get<Type>` read: which one document the call reads — the
 * source (`source/main`, the default) or the ADT metadata document (the
 * object's own URI). One request either way, and the answer carries only the
 * document asked for.
 */

export type ReadPart = 'source' | 'metadata';

/** The `part` property of a `Get<Type>` input schema. */
export const READ_PART_PROPERTY = {
  type: 'string',
  enum: ['source', 'metadata'],
  description:
    'The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).',
  default: 'source',
} as const;

/** The part a call asked for, or an error naming the two values. */
export function readPartOf(part: unknown): ReadPart | Error {
  if (part === undefined || part === 'source') return 'source';
  if (part === 'metadata') return 'metadata';
  return new Error('part must be "source" or "metadata"');
}
