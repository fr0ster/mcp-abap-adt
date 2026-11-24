/**
 * Each compact pair says what its route does (Codex review of PR #378):
 * the words of a member, part or action are checked against the handler
 * that serves it, one case per finding.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactDeleteDescription,
  compactDeletionCheckDescription,
} from '../../../lib/compact/compactDescriptions';

describe('the compact pairs say what each route does', () => {
  it('CDS_UNIT_TEST is deleted, and checked for deletion, as the global test class of a CDS view', () => {
    for (const variant of ['onprem', 'cloud'] as const) {
      for (const text of [
        compactDeleteDescription(variant),
        compactDeletionCheckDescription(variant),
      ]) {
        assert.ok(
          text.includes('the global test class (CLAS) of a CDS view (DDLS)'),
          text,
        );
        assert.equal(text.includes('unit tests of a CDS view'), false, text);
      }
    }
  });
});
