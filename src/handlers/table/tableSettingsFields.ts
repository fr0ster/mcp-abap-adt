/**
 * The settings a technical settings write names: UpdateTableSettings' and
 * compact HandlerUpdate's TABLE_SETTINGS fields, apart from either handler so
 * a schema can take them without linking a write.
 */
import * as z from 'zod';
import { requiredText } from '../../lib/handlers/argumentRules';

/** The settings an update may name, on every system kind. */
export const SETTINGS_SHAPE = {
  table_name: requiredText('table_name is required').describe(
    'Table name. The table must already exist.',
  ),
  data_class: z
    .string()
    .optional()
    .describe(
      'Data class. The value help lists APPL0 (master data), APPL1 (transaction data), APPL2 (organization and customizing) and DDIM, DFACT, DODS; SAP checks the value when the table is activated.',
    ),
  size_category: z
    .string()
    .optional()
    .describe('Size category, a digit from 0 to 9.'),
  buffering: z
    .object({
      allowed: z
        .string()
        .optional()
        .describe(
          'Whether buffering is allowed: N (not allowed), X (allowed), A (allowed but switched off).',
        ),
      type: z
        .string()
        .optional()
        .describe(
          'Buffering type: P (single records), G (generic area), X (fully buffered).',
        ),
      area_key_fields: z
        .number()
        .int()
        .optional()
        .describe(
          'Number of key fields of a generic area; goes with type G, given here or stored.',
        ),
    })
    .optional()
    .describe('Buffering; each field given replaces the stored one.'),
  storage_type: z.string().optional().describe('Storage type.'),
  sharing_type: z.string().optional().describe('Sharing type.'),
  load_unit: z.string().optional().describe('Load unit.'),
  translation: z
    .string()
    .optional()
    .describe(
      'Translation value; the translation flags keep their stored values.',
    ),
  logging_enabled: z
    .boolean()
    .optional()
    .describe('Whether changes to the table data are logged.'),
};

/**
 * What `is_writable_by_amdp` says on the cloud: DT 771, the activation's
 * refusal of a table writable by AMDP with buffering, logging or a
 * replacement object (Code, cloud: `CL_DDACT_TABL_CHECK_TCHSET_CL` →
 * `chk_writable_amdp_usage`; measured on the cloud, an `E` message and the
 * table left inactive). The owner's wording.
 */
export const AMDP_FLAG = z
  .boolean()
  .optional()
  .describe(
    'true allows AMDP writes; activation then needs buffering N, logging off and no replacement object.',
  );
