/**
 * The compact read types with a metadata document and no source: their read
 * answers that document, so `part: 'source'` has nothing to answer.
 *
 * One list, read by `HandlerGet`'s part routes (which refuse `source` for these)
 * and by the prompts (which ask these for `part: 'metadata'`).
 */
import type { CompactObjectType } from './compactObjectTypes.js';

export const SOURCELESS: ReadonlySet<CompactObjectType> =
  new Set<CompactObjectType>([
    'PACKAGE',
    'DOMAIN',
    'DATA_ELEMENT',
    'FUNCTION_GROUP',
    'TABLE_TYPE',
  ]);

/** Whether the type is read as its metadata document, having no source. */
export function isSourceless(type: CompactObjectType): boolean {
  return SOURCELESS.has(type);
}
