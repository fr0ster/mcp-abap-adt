/**
 * The compact types of an object's sub-resources: a table's technical
 * settings and the text elements of a program, a function group or a class.
 * A legacy system (SAP_BASIS 7.40) serves neither: its recorded discovery
 * lists no `/sap/bc/adt/ddic/db/settings` and no `/textelements` (0
 * occurrences, checked 2026-11-19). The connection reads legacy as on premise
 * (`statedSystemKind`), so the stated system type decides, before any
 * request.
 */
import type { HandlerContext } from '../handlers/interfaces';
import { statedEnvironment } from '../listedTool';
import type { CompactObjectType } from './compactObjectTypes';

/** The sub-resource compact types. */
const SUB_RESOURCE_TYPES: ReadonlySet<CompactObjectType> = new Set([
  'TABLE_SETTINGS',
  'PROGRAM_TEXT_ELEMENTS',
  'FUNCTION_GROUP_TEXT_ELEMENTS',
  'CLASS_TEXT_ELEMENTS',
]);

/** The refusal of a sub-resource type on a stated legacy system. */
export const LEGACY_SUB_RESOURCE_WORDS =
  'The table settings and the text elements are served on onprem and cloud systems; the stated system type is legacy, so nothing was sent.';

/**
 * The refusal of `member` on the context's stated system, or `undefined`
 * where it is served.
 */
export function subResourceRefusal(
  context: Pick<HandlerContext, 'systemType'>,
  member: CompactObjectType,
): string | undefined {
  return SUB_RESOURCE_TYPES.has(member) &&
    statedEnvironment(context.systemType) === 'legacy'
    ? LEGACY_SUB_RESOURCE_WORDS
    : undefined;
}
