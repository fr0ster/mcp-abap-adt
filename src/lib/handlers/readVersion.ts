/**
 * `version` of a read: which version of the object ADT answers. Every read
 * the server sends states one (the owner, 2026-11-01): ADT answers a read
 * without a version from the working area, the inactive version where one
 * exists, and adt-clients sends exactly the version it is given.
 */

import type { AdtReadVersion } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';

const READ_VERSION_WORDS =
  'The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.';

/** The version a read names, as ADT takes it. */
export type ReadVersion = AdtReadVersion;

/** The versions a read tool's `version` takes. */
export const READ_VERSIONS = [
  'active',
  'inactive',
  'workingArea',
] as const satisfies readonly ReadVersion[];

/** The `version` field of a read tool's zod input schema that declares no default. */
export const READ_VERSION_FIELD_UNDEFAULTED = z
  .enum(READ_VERSIONS)
  .optional()
  .describe(READ_VERSION_WORDS);

/** The `version` field of a read tool's zod input schema. */
export const READ_VERSION_FIELD = z
  .enum(READ_VERSIONS)
  .default('active')
  .optional()
  .describe(READ_VERSION_WORDS);
