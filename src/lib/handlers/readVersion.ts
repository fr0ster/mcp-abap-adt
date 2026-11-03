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

/**
 * The `version` property of a read tool's input schema whose schema declares
 * no default: the tool reads the active version when none is given.
 */
export const READ_VERSION_PROPERTY_UNDEFAULTED = {
  type: 'string',
  enum: ['active', 'inactive', 'workingArea'],
  description: READ_VERSION_WORDS,
} as const;

/** The `version` property of a read tool's input schema. */
export const READ_VERSION_PROPERTY = {
  ...READ_VERSION_PROPERTY_UNDEFAULTED,
  default: 'active',
} as const;

/** The `version` field of a read tool's zod input schema that declares no default. */
export const READ_VERSION_FIELD_UNDEFAULTED = z
  .enum(['active', 'inactive', 'workingArea'])
  .optional()
  .describe(READ_VERSION_WORDS);

/** The `version` field of a read tool's zod input schema. */
export const READ_VERSION_FIELD = z
  .enum(['active', 'inactive', 'workingArea'])
  .default('active')
  .optional()
  .describe(READ_VERSION_WORDS);
