/**
 * A function group's lists (Codex round 6, P1-3): a child SAP listed
 * without a name carries its URI, what tells two such apart, and a node
 * SAP could not load is its row at every level — never an empty success.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listAnswerAt } from '../../lib/detail';
import {
  fetchFunctionGroupChildren,
  functionGroupListAnswers,
} from '../../lib/strategies/functionGroupChildren';
import { okResponse } from '../helpers/fakeClient';
import { levelOf } from '../helpers/nodeLevels';

const ROOT = levelOf([], [{ type: 'FUGR/I', nodeId: '000001' }]);

/** The includes level: two nameless includes apart only by their URI, and a node SAP could not load. */
const INCLUDES = {
  ...levelOf([
    { type: 'FUGR/I', name: '', techName: 'LZFGX', uri: '/sap/bc/adt/x/one' },
    { type: 'FUGR/I', name: '', techName: 'LZFGX', uri: '/sap/bc/adt/x/two' },
  ]),
  notLoaded: [{ notLoaded: true as const }],
};

async function children() {
  let call = 0;
  const response = await fetchFunctionGroupChildren(
    {
      fetchNodeStructure: async () =>
        okResponse(call++ === 0 ? ROOT : INCLUDES),
    },
    'ZFG',
    'FUGR/I',
  );
  assert.equal(response.ok, true);
  return response.getResult().value;
}

describe('a function group list', () => {
  it('a node SAP could not load is a child of the list', async () => {
    const listed = await children();
    assert.ok(listed.some((child) => child.notLoaded === true));
  });

  it('terse: two nameless includes stay apart by their URI', async () => {
    const terse = functionGroupListAnswers('ZFG', 'includes').terse(
      await children(),
    ).answer;
    const lines = String(terse).split('\n');
    assert.ok(lines.includes('\t/sap/bc/adt/x/one\t'), lines.join('\n'));
    assert.ok(lines.includes('\t/sap/bc/adt/x/two\t'), lines.join('\n'));
  });

  for (const level of ['terse', 'medium', 'full'] as const) {
    it(`${level}: the node SAP could not load is in the answer`, async () => {
      const answered = listAnswerAt(
        functionGroupListAnswers('ZFG', 'includes'),
        level,
      )(await children());
      const text =
        typeof answered === 'string' ? answered : JSON.stringify(answered);
      assert.ok(text.includes('not loaded by SAP'), text);
    });
  }
});
