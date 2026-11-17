/**
 * A part's draft state from its three ETags (spec §5), the ETag shapes as
 * measured (plan Task 1): `<14 digits>0011` after an activation, `0001` for
 * an inactive version; a CDS view's active and inactive ETags differ by the
 * suffix with no draft, so its versions are compared by their timestamps.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { draftOf, ETAG_RULE } from '../../../lib/draft/draftOf';

const NOW = new Date('2026-11-04T10:31:00Z');
const ACTIVE = '202611041015000011';
const DRAFT = '202611041030000001';

describe('draftOf, the whole-ETag rule', () => {
  it('none when the three are equal: no time', () => {
    const etags = { active: ACTIVE, inactive: ACTIVE, workspace: ACTIVE };
    assert.deepEqual(draftOf(etags, NOW), {
      draft: 'none',
      changed_at: null,
      age_seconds: null,
      etags,
    });
  });

  it("own when the working version is the inactive one: its write's time and age", () => {
    const etags = { active: ACTIVE, inactive: DRAFT, workspace: DRAFT };
    assert.deepEqual(draftOf(etags, NOW), {
      draft: 'own',
      changed_at: '2026-11-04T10:30:00Z',
      age_seconds: 60,
      etags,
    });
  });

  it('other when the working version is the active one', () => {
    const etags = { active: ACTIVE, inactive: DRAFT, workspace: ACTIVE };
    assert.deepEqual(draftOf(etags, NOW), {
      draft: 'other',
      changed_at: '2026-11-04T10:30:00Z',
      age_seconds: 60,
      etags,
    });
  });

  it('undetermined when the three are distinct', () => {
    const etags = {
      active: ACTIVE,
      inactive: DRAFT,
      workspace: '202611041031000001',
    };
    assert.deepEqual(draftOf(etags, NOW), {
      draft: 'undetermined',
      changed_at: null,
      age_seconds: null,
      etags,
    });
  });

  it('undetermined when an ETag is missing, that ETag null', () => {
    const etags = { active: ACTIVE, inactive: null, workspace: ACTIVE };
    const answer = draftOf(etags, NOW);
    assert.equal(answer.draft, 'undetermined');
    assert.equal(answer.etags.inactive, null);
    assert.equal(answer.changed_at, null);
  });

  it('undetermined when an ETag is not led by 14 digits', () => {
    assert.equal(
      draftOf({ active: 'W/"abc"', inactive: DRAFT, workspace: DRAFT }, NOW)
        .draft,
      'undetermined',
    );
  });

  it('the age is whole seconds, the floor', () => {
    const etags = { active: ACTIVE, inactive: DRAFT, workspace: DRAFT };
    assert.equal(
      draftOf(etags, new Date('2026-11-04T10:31:00.900Z')).age_seconds,
      60,
    );
  });

  it('the whole ETag is compared: a CDS view after activation reads other under it', () => {
    const etags = {
      active: '202611041015000011',
      inactive: '202611041015000001',
      workspace: '202611041015000011',
    };
    assert.equal(draftOf(etags, NOW, ETAG_RULE).draft, 'other');
  });
});

describe('draftOf, the timestamp rule (a CDS view, measured)', () => {
  const rule = { compare: 'timestamp', timeKnown: true } as const;

  it('none after an activation: the timestamps are equal, the suffixes not', () => {
    const etags = {
      active: '202611121024290011',
      inactive: '202611121024290001',
      workspace: '202611121024290011',
    };
    assert.equal(draftOf(etags, NOW, rule).draft, 'none');
  });

  it("own after the caller's write", () => {
    const etags = {
      active: '202611121024290011',
      inactive: '202611121024320001',
      workspace: '202611121024320001',
    };
    const answer = draftOf(etags, new Date('2026-11-12T10:25:32Z'), rule);
    assert.equal(answer.draft, 'own');
    assert.equal(answer.changed_at, '2026-11-12T10:24:32Z');
    assert.equal(answer.age_seconds, 60);
  });

  it("other after another user's write", () => {
    const etags = {
      active: '202611121024290011',
      inactive: '202611121024320001',
      workspace: '202611121024290011',
    };
    assert.equal(draftOf(etags, NOW, rule).draft, 'other');
  });
});

describe('draftOf, a type whose ETag time is not known', () => {
  const rule = { compare: 'etag', timeKnown: false } as const;
  const active = '19710401000000001text/plain_A=';
  const draft = '19710401000000000text/plain_B=';

  it('reads the state and answers no time', () => {
    const etags = { active, inactive: draft, workspace: draft };
    assert.deepEqual(draftOf(etags, NOW, rule), {
      draft: 'own',
      changed_at: null,
      age_seconds: null,
      etags,
    });
  });
});
