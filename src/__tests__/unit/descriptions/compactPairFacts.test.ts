/**
 * Each compact pair says what its route does (Codex review of PR #378):
 * the words of a member, part or action are checked against the handler
 * that serves it, one case per finding.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NARROWINGS } from '../../../lib/access/narrowing';
import {
  compactDeleteDescription,
  compactDeletionCheckDescription,
  compactGetDescription,
} from '../../../lib/compact/compactDescriptions';
import { listedJson } from '../../helpers/listedJson';

const DRAFT_PAIR =
  'reads whether a repository object holds an unactivated change, and whose';

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

  it('HandlerGet reads whether an object holds an unactivated change, and whose — and only while the draft part is served', () => {
    for (const variant of ['onprem', 'cloud'] as const) {
      const text = compactGetDescription(variant);
      assert.ok(text.includes(DRAFT_PAIR), text);
      assert.equal(text.includes("object's unactivated change"), false, text);
    }
    const get = NARROWINGS.get('HandlerGet');
    assert.ok(get !== undefined);
    const packageOnly = get.definition('onprem', ['PACKAGE'], undefined);
    const part = listedJson(packageOnly.inputSchema).properties?.part;
    assert.ok(part !== undefined && typeof part !== 'boolean');
    assert.equal((part.enum ?? []).includes('draft'), false);
    assert.equal(packageOnly.description.includes(DRAFT_PAIR), false);
    const withClass = get.definition('onprem', ['PACKAGE', 'CLASS'], undefined);
    assert.ok(withClass.description.includes(DRAFT_PAIR));
  });
});
