/**
 * The types the draft tool reads, per variant, and the parts it reads of
 * each (spec §5.1, measured in plan Task 1; the owner's decisions on what is
 * offered). Package, message class and service binding are not offered:
 * their ETags do not follow the version, or no draft of them can be made.
 */
import type { ProjectionVariant } from '../adtProjections';
import { COMPACT_READ } from '../adtProjections';
import { type DraftRule, ETAG_RULE } from './draftOf';

/** A type the draft tool reads. */
export type DraftObjectType =
  | 'PROGRAM'
  | 'INCLUDE'
  | 'INTERFACE'
  | 'CLASS'
  | 'BEHAVIOR_IMPLEMENTATION'
  | 'FUNCTION_MODULE'
  | 'FUNCTION_GROUP'
  | 'DDL'
  | 'BEHAVIOR_DEFINITION'
  | 'METADATA_EXTENSION'
  | 'SERVICE_DEFINITION'
  | 'TABLE'
  | 'STRUCTURE'
  | 'DOMAIN'
  | 'DATA_ELEMENT'
  | 'TABLE_TYPE';

/** A part read: the main source (or the metadata), or a class include. */
export type DraftPart =
  | 'main'
  | 'implementations'
  | 'definitions'
  | 'testclasses'
  | 'macros';

const CLOUD_TYPES = [
  'INTERFACE',
  'CLASS',
  'BEHAVIOR_IMPLEMENTATION',
  'FUNCTION_MODULE',
  'FUNCTION_GROUP',
  'DDL',
  'BEHAVIOR_DEFINITION',
  'METADATA_EXTENSION',
  'SERVICE_DEFINITION',
  'TABLE',
  'STRUCTURE',
  'DOMAIN',
  'DATA_ELEMENT',
  'TABLE_TYPE',
] as const satisfies readonly DraftObjectType[];

/** The types the draft tool reads, per variant: a program and an include on premise only. */
export const DRAFT_TYPES = {
  onprem: ['PROGRAM', 'INCLUDE', ...CLOUD_TYPES],
  cloud: CLOUD_TYPES,
} as const satisfies {
  readonly [V in ProjectionVariant]: readonly DraftObjectType[];
};

/**
 * A class's parts, per variant: on premise the main source's ETag is one for
 * every version, so its includes alone; on the cloud the main source too,
 * and no macros (not ABAP Cloud).
 */
const CLASS_PARTS = {
  onprem: ['implementations', 'definitions', 'testclasses', 'macros'],
  cloud: ['main', 'implementations', 'definitions', 'testclasses'],
} as const satisfies {
  readonly [V in ProjectionVariant]: readonly DraftPart[];
};

/** The parts read of `type` on `variant`, in answer order. */
export function draftPartsOf(
  type: DraftObjectType,
  variant: ProjectionVariant,
): readonly DraftPart[] {
  return type === 'CLASS' || type === 'BEHAVIOR_IMPLEMENTATION'
    ? CLASS_PARTS[variant]
    : ['main'];
}

/**
 * The parts the draft tool reads on `variant`, in words for a description:
 * the class includes named only for the class types among `types`.
 */
export function draftPartWords(
  variant: ProjectionVariant,
  types: readonly string[],
): string {
  const classes = types.filter(
    (type) => type === 'CLASS' || type === 'BEHAVIOR_IMPLEMENTATION',
  );
  if (classes.length === 0) return 'main, the source or metadata';
  const includes = CLASS_PARTS[variant].filter((part) => part !== 'main');
  const which = classes.join(' and ');
  return variant === 'onprem'
    ? `main, the source or metadata; for ${which} the includes ${includes.join(', ')} in place of the main source`
    : `main, the source or metadata; for ${which} also the includes ${includes.join(', ')}`;
}

/** How a type's ETags are compared and whether their timestamp is the change's time. */
export function draftRuleOf(type: DraftObjectType): DraftRule {
  if (type === 'DDL') return { compare: 'timestamp', timeKnown: true };
  if (type === 'METADATA_EXTENSION' || type === 'SERVICE_DEFINITION') {
    return { compare: 'etag', timeKnown: false };
  }
  return ETAG_RULE;
}

/** A member of `HandlerGet`'s `object_type`. */
type ReadMember = (typeof COMPACT_READ.onprem)[number];

function isReadMember(
  type: DraftObjectType,
  members: readonly ReadMember[],
): type is DraftObjectType & ReadMember {
  return members.some((member) => member === type);
}

function readMembersOf(
  variant: ProjectionVariant,
): readonly (DraftObjectType & ReadMember)[] {
  const members: readonly ReadMember[] = COMPACT_READ[variant];
  return DRAFT_TYPES[variant].filter(
    (type): type is DraftObjectType & ReadMember => isReadMember(type, members),
  );
}

/**
 * The draft types `HandlerGet` reads with `part: 'draft'`: those of
 * `DRAFT_TYPES[variant]` its `object_type` lists.
 */
export const HANDLER_GET_DRAFT_TYPES: {
  readonly [V in ProjectionVariant]: readonly (DraftObjectType & ReadMember)[];
} = {
  onprem: readMembersOf('onprem'),
  cloud: readMembersOf('cloud'),
};
