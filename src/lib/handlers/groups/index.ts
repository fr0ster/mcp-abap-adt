/**
 * Handler groups exports
 *
 * Handler groups allow splitting handlers into logical groups for flexible composition.
 * Each group can be injected independently, allowing different server configurations
 * to use different sets of handlers.
 */

export { CompactHandlersGroup } from './CompactHandlersGroup.js';
// The two halves of the compact facade, so a consumer can take the capability
// it means to hand out: the read-only group's module graph carries no write
// route (see compactCapabilitySplit.test.ts).
export { CompactModifyHandlersGroup } from './CompactModifyHandlersGroup.js';
export { CompactReadOnlyHandlersGroup } from './CompactReadOnlyHandlersGroup.js';
export { HighLevelHandlersGroup } from './HighLevelHandlersGroup.js';
export { LowLevelHandlersGroup } from './LowLevelHandlersGroup.js';
export { ReadOnlyHandlersGroup } from './ReadOnlyHandlersGroup.js';
export { SearchHandlersGroup } from './SearchHandlersGroup.js';
export { SystemHandlersGroup } from './SystemHandlersGroup.js';
export {
  type IReadOnlyDedupStrategy,
  NoDedupStrategy,
  ReadVsGetDedupStrategy,
} from './strategies/index.js';
