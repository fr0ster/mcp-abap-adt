/**
 * The abapGit live suite's pull helpers: the run interface's source with
 * its marker, the remote change that swaps it, what R6 lists as changed
 * locally, and the run statuses a job succeeds with.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actionsOf,
  interfaceSource,
  overwriteOf,
  succeeded,
  swapMarker,
} from '../../integration/helpers/abapGitPull';

describe('the run interface and its remote change', () => {
  it('the source holds the marker as its one constant, inside the interface', () => {
    const source = interfaceSource('ZAGS_I1', 'run v1');
    assert.equal(
      source,
      "INTERFACE zags_i1\n  PUBLIC.\n  CONSTANTS c_marker TYPE string VALUE 'run v1'.\nENDINTERFACE.\n",
    );
  });

  it('the remote change swaps the quoted marker and nothing else', () => {
    const file = interfaceSource('ZAGS_I1', 'run v1');
    assert.equal(
      swapMarker(file, 'run v1', 'run v2'),
      interfaceSource('ZAGS_I1', 'run v2'),
    );
  });

  it('a file without the quoted marker is refused, naming it', () => {
    assert.throws(
      () => swapMarker('INTERFACE zags_i1.\nENDINTERFACE.\n', 'run v1', 'x'),
      /does not hold 'run v1'/,
    );
  });
});

describe("R6's entries", () => {
  it("overwrite names R6's overwrite entries of one name by their type and name as R6 answered them", () => {
    assert.deepEqual(
      overwriteOf(
        {
          overwriteObjects: [
            { name: 'ZAGS_I1', type: 'INTF', uri: '/u', action: 2 },
            { name: 'ZAGS_I3', type: 'INTF' },
          ],
          packageWarningObjects: [{ name: 'ZAGS_I1', type: 'INTF' }],
        },
        'ZAGS_I1',
      ),
      [{ type: 'INTF', name: 'ZAGS_I1' }],
    );
  });

  it("the actions R6's overwrite entries of one name carry, as R6 answered them", () => {
    assert.deepEqual(
      actionsOf(
        {
          overwriteObjects: [
            { name: 'ZAGS_I1', type: 'INTF', action: 2 },
            { name: 'ZAGS_I3', type: 'INTF', action: 3 },
          ],
          packageWarningObjects: [{ name: 'ZAGS_I1', type: 'INTF', action: 1 }],
        },
        'ZAGS_I1',
      ),
      [2],
    );
  });

  it('none listed is none', () => {
    assert.deepEqual(actionsOf({ overwriteObjects: [] }, 'ZAGS_I1'), []);
  });
});

describe('a succeeded job', () => {
  it('S and W succeed; E, A and anything else do not', () => {
    assert.deepEqual(['S', 'W', 'E', 'A', 'R', '', undefined].map(succeeded), [
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
