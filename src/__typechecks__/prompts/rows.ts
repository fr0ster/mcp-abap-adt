/**
 * The prompt rows are typed against their tools (spec §9, test 8): a full
 * row's name key is a key of its tool's input, a compact row's name key a
 * property its member's takes name, and `LOCKED_AS` holds an entry for every
 * member a write locks under another object. Checked by `test:check`; never
 * emitted. Each directive is used only because its error occurs.
 */

import { TOOL_DEFINITION as CreateClass } from '../../handlers/class/high/handleCreateClass';
import { TOOL_DEFINITION as UpdateClass } from '../../handlers/class/high/handleUpdateClass';
import type { COMPACT_CREATE_TAKES } from '../../lib/compact/compactSchemas';
import {
  type CompactNameKey,
  fullRow,
  type LOCKED_AS,
} from '../../lib/prompts/objectRows';

// @ts-expect-error CreateClass takes no program_name
export const wrongFullKey = fullRow(CreateClass, 'program_name');

// @ts-expect-error HandlerCreate's CLASS takes no program_name
export const wrongCompactKey: CompactNameKey<
  typeof COMPACT_CREATE_TAKES,
  'CLASS'
> = 'program_name';

// @ts-expect-error LOCAL_TYPES is written under the class's lock, so it needs its entry
export const lockedWithoutLocalTypes: typeof LOCKED_AS = {
  LOCAL_TEST_CLASS: 'CLASS',
  LOCAL_DEFINITIONS: 'CLASS',
  LOCAL_MACROS: 'CLASS',
  UNIT_TEST: 'CLASS',
  CDS_UNIT_TEST: 'CLASS',
  BEHAVIOR_IMPLEMENTATION: 'CLASS',
};

// @ts-expect-error a behavior implementation is written under the class's lock (ruling C9), so it needs its entry
export const lockedWithoutBehaviorImplementation: typeof LOCKED_AS = {
  LOCAL_TEST_CLASS: 'CLASS',
  LOCAL_TYPES: 'CLASS',
  LOCAL_DEFINITIONS: 'CLASS',
  LOCAL_MACROS: 'CLASS',
  UNIT_TEST: 'CLASS',
  CDS_UNIT_TEST: 'CLASS',
};

export const wrongContentKey = fullRow(UpdateClass, 'class_name', {
  // @ts-expect-error UpdateClass takes no ddl_code
  content: 'ddl_code',
});
