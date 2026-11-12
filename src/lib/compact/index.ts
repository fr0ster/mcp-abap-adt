/**
 * The compact facade's shared kernel — data and dispatch, no tool and no handler.
 *
 * The compact TOOLS move into packages of their own
 * (`@mcp-abap-adt/compact-readonly-entries`, `@mcp-abap-adt/compact-modify`); these five
 * modules do not, because both packages need them and neither may depend on the
 * other: the object types, the CRUD matrix that says which type does what, the
 * input schemas, the projections of the type tables and their boundary, and `dispatchCompact` with the route types.
 *
 * Nothing here imports a handler, which is what makes it shareable at all — a
 * shared module that pulled a write route would hand one to the read-only package
 * and undo the capability split (`compactCapabilitySplit.test.ts`).
 */

import '../instance.js';

export * from '../adtProjections.js';
export {
  acceptedCodeOf,
  acceptedOf,
  mainTypeCodeOf,
  notAccepted,
  sharedMainType,
} from '../adtTypeCode.js';
export type { ReadVersion } from '../handlers/readVersion.js';
export { jsonOf } from '../jsonText.js';
export { LONG_TOOL_ADVICE, withLongToolAdvice } from '../longTools.js';
export {
  LOCK_NOT_HELD_HERE_WORDS,
  LOCK_NOT_HELD_WORDS,
  lockHeldHere,
  lockNotHeldWords,
} from '../state/heldLocks.js';
export { DETAIL_SHAPE } from '../strategies/detail.js';
export { byVariant } from '../variantDefinition.js';
export { child, type Element, isElement, isList } from '../xml/tree.js';
export { handlerBatchDefinition } from './batch/handleHandlerBatch.js';
export * from './compactDescriptions.js';
export {
  COMPACT_CRUD_MATRIX,
  type CompactCrudOperation,
} from './compactMatrix.js';
export {
  COMPACT_OBJECT_TYPES,
  type CompactObjectType,
} from './compactObjectTypes.js';
export {
  type CompactHandler,
  type CompactRouterMap,
  dispatchCompact,
} from './compactRoutes.js';
export {
  COMPACT_MAIN_PROGRAMS,
  compactActivateSchema,
  compactActivateSchemaFor,
  compactCdsUnitTestResultSchema,
  compactCdsUnitTestStatusSchema,
  compactCheckRunSchema,
  compactCheckRunSchemaFor,
  compactCreateSchema,
  compactCreateSchemaFor,
  compactDeleteSchema,
  compactDeleteSchemaFor,
  compactDeletionCheckSchema,
  compactDeletionCheckSchemaFor,
  compactDumpListSchema,
  compactDumpViewSchema,
  compactGetDataSchema,
  compactGetSchema,
  compactGetSchemaFor,
  compactLockSchema,
  compactLockSchemaFor,
  compactProfileListSchema,
  compactProfileRunSchema,
  compactProfileRunSchemaFor,
  compactProfileScheduleSchema,
  compactProfileViewSchema,
  compactSearchSchema,
  compactServiceBindingListTypesSchema,
  compactServiceBindingValidateSchema,
  compactTransportCreateSchema,
  compactTransportMoveObjectsSchema,
  compactTransportSortAndCompressSchema,
  compactUnitTestResultSchema,
  compactUnitTestRunSchema,
  compactUnitTestStatusSchema,
  compactUnlockSchema,
  compactUnlockSchemaFor,
  compactUpdateSchema,
  compactUpdateSchemaFor,
  compactValidateSchema,
  compactValidateSchemaFor,
  compactWhereUsedSchema,
  compactWhereUsedSchemaFor,
  DELETABLE_TYPES,
  DELETION_CHECK_TYPES,
  EMPTIED_INCLUDE_TYPES,
  handlerGetDataDefinition,
} from './compactSchemas.js';
export { handlerDebugBatchDefinition } from './debug/handleHandlerDebugBatch.js';
export { handlerDebugBreakpointsDefinition } from './debug/handleHandlerDebugBreakpoints.js';
export { handlerDebugMaintainDefinition } from './debug/handleHandlerDebugMaintain.js';
export { handlerDebugSessionDefinition } from './debug/handleHandlerDebugSession.js';
export { handlerDebugStepDefinition } from './debug/handleHandlerDebugStep.js';
export { handlerSessionDefinition } from './longSession/handleHandlerSession.js';
export {
  either,
  exampleCodes,
  type Left,
  leftOf,
  listed,
  textsOf,
  when,
} from './memberTexts.js';
