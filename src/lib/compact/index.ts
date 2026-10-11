/**
 * The compact facade's shared kernel — data and dispatch, no tool and no handler.
 *
 * The compact TOOLS move into packages of their own
 * (`@mcp-abap-adt/compact-readonly`, `@mcp-abap-adt/compact-modify`); these five
 * modules do not, because both packages need them and neither may depend on the
 * other: the object types, the CRUD matrix that says which type does what, the
 * input schemas, the lifecycle helpers, and `dispatchCompact` with the route types.
 *
 * Nothing here imports a handler, which is what makes it shareable at all — a
 * shared module that pulled a write route would hand one to the read-only package
 * and undo the capability split (`compactCapabilitySplit.test.ts`).
 */

export { DETAIL_PROPERTY } from '../strategies/detail.js';
export {
  type LowObjectType,
  toLowObjectType,
} from './compactLifecycleUtils.js';
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
export * from './compactSchemas.js';
