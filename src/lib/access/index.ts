/**
 * The access restrictions (spec §3): the deny list applied at registration,
 * and the call-time checks — the strategy interface and the two shipped
 * strategies.
 */
export type {
  AccessCall,
  AccessRefusalCode,
  AccessVerdict,
  IAccessChecks,
  IPackageReader,
  NamedValue,
} from './accessChecks.js';
export type {
  AccessLists,
  AccessRestrictions,
  NameEntry,
  PackageEntry,
} from './accessLists.js';
export {
  type DeniedActions,
  type DeniedEntry,
  parseDeniedEntry,
} from './deniedActions.js';
export { listedAccessChecks } from './listedAccessChecks.js';
export {
  accessChecksFor,
  packageTreeAccessChecks,
} from './packageTreeAccessChecks.js';
export { accessStartLine } from './startLine.js';
export { unmatchedEntries, withoutDenied } from './withoutDenied.js';
