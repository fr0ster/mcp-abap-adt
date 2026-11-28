/**
 * The conflict retry (#394, spec §2): only a step SAP refused is sent again
 * under the conflict rule; a step that failed on the network, unclassified,
 * in a lost session or after a credential refusal never is, whatever its
 * words say.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTransientConflict } from '../../integration/helpers/testers/HighTester';

describe('isTransientConflict', () => {
  it('a network failure whose words say "already exists" is not sent again', () => {
    assert.equal(
      isTransientConflict(
        'network',
        undefined,
        'The request failed: already exists',
      ),
      false,
    );
  });

  it('no outcome but refused is sent again, even with a 409', () => {
    for (const outcome of [
      'network',
      'unclassified',
      'session-lost',
      'credential',
      'ok',
    ] as const) {
      assert.equal(
        isTransientConflict(outcome, 409, 'SWB_TOOL019'),
        false,
        outcome,
      );
    }
  });

  it('a refused 409, or SAP not past a prior deletion, is (characterization)', () => {
    assert.equal(isTransientConflict('refused', 409, ''), true);
    assert.equal(
      isTransientConflict('refused', 400, 'SWB_TOOL019 description is missing'),
      true,
    );
    assert.equal(
      isTransientConflict('refused', 400, 'locked by another user'),
      false,
    );
  });
});
