/**
 * The compact member tokens are exported accessors, and each compact
 * tool's member table (`memberTokens`) names its members through them: a
 * prompt that quotes a member's token quotes the table's own words.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPACT_ACTIVATE,
  COMPACT_CHECK,
  COMPACT_CREATE,
  COMPACT_DELETE,
  COMPACT_LOCK,
  COMPACT_READ,
  COMPACT_UNLOCK,
  COMPACT_UPDATE,
  type ProjectionVariant,
} from '../../../lib/adtProjections';
import {
  activateToken,
  checkToken,
  createToken,
  deleteToken,
  lockToken,
  memberTokens,
  readToken,
  unlockToken,
  updateToken,
} from '../../../lib/compact/compactDescriptions';

/** One tool: its description on a variant and each of its members' tokens there. */
type ToolTokens = {
  readonly tool: string;
  readonly description: (variant: ProjectionVariant) => string;
  readonly tokens: (variant: ProjectionVariant) => readonly string[];
};

const TOOLS: readonly ToolTokens[] = [
  {
    tool: 'HandlerCreate',
    description: (v) => memberTokens('HandlerCreate', v),
    tokens: (v) => COMPACT_CREATE[v].map(createToken),
  },
  {
    tool: 'HandlerGet',
    description: (v) => memberTokens('HandlerGet', v),
    tokens: (v) => COMPACT_READ[v].map(readToken),
  },
  {
    tool: 'HandlerUpdate',
    description: (v) => memberTokens('HandlerUpdate', v),
    tokens: (v) => COMPACT_UPDATE[v].map(updateToken),
  },
  {
    tool: 'HandlerDelete',
    description: (v) => memberTokens('HandlerDelete', v),
    tokens: (v) => COMPACT_DELETE[v].map(deleteToken),
  },
  {
    tool: 'HandlerLock',
    description: (v) => memberTokens('HandlerLock', v),
    tokens: (v) => COMPACT_LOCK[v].map(lockToken),
  },
  {
    tool: 'HandlerUnlock',
    description: (v) => memberTokens('HandlerUnlock', v),
    tokens: (v) => COMPACT_UNLOCK[v].map(unlockToken),
  },
  {
    tool: 'HandlerCheckRun',
    description: (v) => memberTokens('HandlerCheckRun', v),
    tokens: (v) => COMPACT_CHECK[v].map(checkToken),
  },
  {
    tool: 'HandlerActivate',
    description: (v) => memberTokens('HandlerActivate', v),
    tokens: (v) => COMPACT_ACTIVATE[v].map(activateToken),
  },
];

for (const variant of ['onprem', 'cloud'] as const) {
  describe(`compact member tokens (${variant})`, () => {
    for (const { tool, description, tokens } of TOOLS) {
      it(`${tool}: every member's token is in the member table`, () => {
        const text = description(variant);
        const listed = tokens(variant);
        assert.ok(listed.length > 0);
        for (const token of listed) {
          assert.ok(text.includes(token), `${tool} lacks ${token}`);
        }
      });
    }
  });
}

describe('a token names its member with the arguments it takes', () => {
  it('reads the tables the descriptions read', () => {
    assert.equal(createToken('CLASS'), 'CLASS(class_name*, package_name*)');
    assert.equal(
      updateToken('CLASS'),
      'CLASS(class_name*, source_code*, transport_request)',
    );
    assert.equal(
      deleteToken('LOCAL_TYPES'),
      'LOCAL_TYPES(class_name*, lock_handle*, transport_request)',
    );
    assert.equal(lockToken('CLASS'), 'CLASS(object_name*)');
    assert.equal(lockToken('PACKAGE'), 'PACKAGE(object_name*, super_package)');
    assert.equal(unlockToken('CLASS'), 'CLASS(object_name*, lock_handle*)');
    assert.equal(checkToken('CLASS'), 'CLASS(object_name*)');
    assert.equal(readToken('CLASS'), 'CLASS(class_name*)');
    assert.equal(activateToken('CLASS'), 'CLASS');
    assert.equal(
      activateToken('FUNCTION_MODULE'),
      'FUNCTION_MODULE(object_name* as GROUP|MODULE, or object_name* with function_group_name*)',
    );
  });
});
