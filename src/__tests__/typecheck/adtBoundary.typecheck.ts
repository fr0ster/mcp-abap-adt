/**
 * The boundary's types and the server's maps (#329, S4), checked by the
 * compiler: `npm run test:check` compiles this file, and each
 * `@ts-expect-error` below fails the check the moment the line it marks
 * compiles.
 *
 * Each negative check stands beside the positive one it differs from, so a
 * check cannot pass because the whole line is broken.
 *
 * Nothing runs here: it is not a test file, and Jest never loads it.
 */

import {
  type CHECK_KIND_ROUTES,
  CHECK_KINDS,
  type COMPACT_ACTIVATE_ROUTES,
  type COMPACT_CHECK_ROUTES,
  type KindsOf,
  type LOCK_KINDS,
  type VersionedKind,
  WHERE_USED_CODES,
  WHERE_USED_NAMES,
} from '../../lib/adtProjections';
import { acceptedCodeOf, acceptedOf } from '../../lib/adtTypeCode';
import type {
  BREAKPOINT_OBJECT_CODES,
  BreakpointLabel,
  RunKind,
} from '../../lib/debugger/objectUri';

// --- Past the boundary, a value is typed as its projection -----------------

/** A check kind, past the boundary, is one of the check kinds… */
export const checked: (typeof CHECK_KINDS.onprem)[number] | undefined =
  acceptedOf('class', CHECK_KINDS.onprem);
// @ts-expect-error …and not a lock kind the check does not take.
export const checkedAsLock: 'service_binding' | undefined = acceptedOf(
  'class',
  CHECK_KINDS.onprem,
);

/** A where-used argument is a where-used code, named by a code or a name. */
export const whereUsed: (typeof WHERE_USED_CODES.cloud)[number] | undefined =
  acceptedCodeOf('class', WHERE_USED_CODES.cloud, WHERE_USED_NAMES.cloud);
// @ts-expect-error …never a function include, which has no where-used.
export const whereUsedInclude: 'FUGR/I' | undefined = acceptedCodeOf(
  'class',
  WHERE_USED_CODES.cloud,
  WHERE_USED_NAMES.cloud,
);

// --- The low kinds per variant ---------------------------------------------

export const classLockedOnCloud: (typeof LOCK_KINDS.cloud)[number] = 'class';
// @ts-expect-error a program is locked on premise only.
export const programLockedOnCloud: (typeof LOCK_KINDS.cloud)[number] =
  'program';

/** A compact member is handed on as the kind of its own API… */
export const checkKinds = {
  CLASS: 'class',
  PROGRAM: 'program',
  INTERFACE: 'interface',
  FUNCTION_GROUP: 'function_group',
  FUNCTION_MODULE: 'function_module',
  TABLE: 'table',
  STRUCTURE: 'structure',
  DDL: 'ddl',
  DOMAIN: 'domain',
  DATA_ELEMENT: 'data_element',
  PACKAGE: 'package',
  BEHAVIOR_DEFINITION: 'behavior_definition',
  METADATA_EXTENSION: 'metadata_extension',
} as const satisfies KindsOf<
  typeof COMPACT_CHECK_ROUTES,
  typeof CHECK_KIND_ROUTES
>;
export const checkKindsCrossed = {
  ...checkKinds,
  // @ts-expect-error …never the kind of another API.
  CLASS: 'program',
} as const satisfies KindsOf<
  typeof COMPACT_CHECK_ROUTES,
  typeof CHECK_KIND_ROUTES
>;

// --- The version tools' kinds ----------------------------------------------

export const classVersioned: VersionedKind = 'class';
// @ts-expect-error a domain has no version history: no table lists `versions`.
export const domainVersioned: VersionedKind = 'domain';

// --- HandlerActivate's routes ----------------------------------------------

/** A function module is activated as `FUGR/FF`, under its group… */
export const moduleActivated: (typeof COMPACT_ACTIVATE_ROUTES)['FUNCTION_MODULE'] =
  'FUGR/FF';
// @ts-expect-error …never as the group itself.
export const moduleAsGroup: (typeof COMPACT_ACTIVATE_ROUTES)['FUNCTION_MODULE'] =
  'FUGR/F';

/** A behaviour implementation is activated as a class. */
export const implementationActivated: (typeof COMPACT_ACTIVATE_ROUTES)['BEHAVIOR_IMPLEMENTATION'] =
  'CLAS/OC';

// --- The debugger's labels -------------------------------------------------

/** `FUNC` is a function module (`FUGR/FF`)… */
export const funcIsModule: (typeof BREAKPOINT_OBJECT_CODES)['FUNC'] = 'FUGR/FF';
// @ts-expect-error …not a function group.
export const funcIsGroup: (typeof BREAKPOINT_OBJECT_CODES)['FUNC'] = 'FUGR/F';

export const classLabel: BreakpointLabel = 'CLAS';
// @ts-expect-error a group holds no breakpoint of its own: no label.
export const groupLabel: BreakpointLabel = 'FUGR';

export const classRun: RunKind = 'class';
// @ts-expect-error an interface is not run: no table lists `run` for it.
export const interfaceRun: RunKind = 'interface';
