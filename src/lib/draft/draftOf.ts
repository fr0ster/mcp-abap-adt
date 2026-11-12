/**
 * Whether a part of an object holds an unactivated change, and whose (spec
 * §5): read from the ETags of its active, inactive and working versions, as
 * the caller's session sees them. Pure: the reads are `readDraftEtags`.
 *
 * Measured (plan Task 1): after an activation the three ETags are equal; an
 * unactivated write gives the inactive version a new ETag led by the write's
 * time; the writer's working version answers that ETag, another user's the
 * active one. A CDS view's active and inactive ETags differ with no draft
 * (the same timestamp, another suffix): its versions are compared by their
 * 14-digit timestamps. A metadata extension's and a service definition's
 * ETag timestamp is a constant: their state is read, their time is not.
 */

/** A part's state: no change, the caller's, another user's, or not readable from the ETags. */
export type DraftState = 'none' | 'own' | 'other' | 'undetermined';

/** The ETags a part's three reads answered; `null` where an answer carried none. */
export interface DraftEtags {
  readonly active: string | null;
  readonly inactive: string | null;
  readonly workspace: string | null;
}

/** How a part's ETags are compared, and whether their timestamp is the change's time. */
export interface DraftRule {
  readonly compare: 'etag' | 'timestamp';
  readonly timeKnown: boolean;
}

/** The whole-ETag comparison, its timestamp the change's time: most types. */
export const ETAG_RULE: DraftRule = { compare: 'etag', timeKnown: true };

/** One part's answer. */
export interface DraftPartState {
  readonly draft: DraftState;
  readonly changed_at: string | null;
  readonly age_seconds: number | null;
  readonly etags: DraftEtags;
}

const DIGITS = '0123456789';

/** The ETag's leading 14 digits; `undefined` when it is not led by them. */
function timestampOf(etag: string): string | undefined {
  const head = etag.slice(0, 14);
  if (head.length !== 14) return undefined;
  for (const character of head) {
    if (!DIGITS.includes(character)) return undefined;
  }
  return head;
}

/** `YYYYMMDDHHMMSS` as `YYYY-MM-DDTHH:MM:SSZ`. */
function isoOf(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`;
}

function stateOf(
  active: string,
  inactive: string,
  workspace: string,
): DraftState {
  if (active === inactive) return 'none';
  if (workspace === inactive) return 'own';
  if (workspace === active) return 'other';
  return 'undetermined';
}

/** A part's state from its three ETags, its age against `now`. */
export function draftOf(
  etags: DraftEtags,
  now: Date,
  rule: DraftRule = ETAG_RULE,
): DraftPartState {
  const unknown = {
    draft: 'undetermined' as const,
    changed_at: null,
    age_seconds: null,
    etags,
  };
  const { active, inactive, workspace } = etags;
  if (active === null || inactive === null || workspace === null) {
    return unknown;
  }
  const stamps = {
    active: timestampOf(active),
    inactive: timestampOf(inactive),
    workspace: timestampOf(workspace),
  };
  if (
    stamps.active === undefined ||
    stamps.inactive === undefined ||
    stamps.workspace === undefined
  ) {
    return unknown;
  }
  const draft =
    rule.compare === 'timestamp'
      ? stateOf(stamps.active, stamps.inactive, stamps.workspace)
      : stateOf(active, inactive, workspace);
  if (draft === 'none' || draft === 'undetermined' || !rule.timeKnown) {
    return { draft, changed_at: null, age_seconds: null, etags };
  }
  const changed = isoOf(stamps.inactive);
  return {
    draft,
    changed_at: changed,
    age_seconds: Math.floor((now.getTime() - Date.parse(changed)) / 1000),
    etags,
  };
}
