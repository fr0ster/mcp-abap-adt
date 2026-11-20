import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  corpusBody,
  corpusCases,
  corpusSidecar,
} from '../../helpers/adtCorpus';

describe('the debugger answers recorded on a system', () => {
  for (const prefix of [
    'debugger-run-to-line',
    'debugger-conversation',
    'debugger-kinds-and-exception',
    'debugger-message-and-objects',
    'debugger-terminate',
    'memory-snapshot-list',
    'amdp-debugger',
    'debugger-conflict',
    'debugger-memory',
  ]) {
    it(format('%s is in the corpus', prefix), () => {
      assert.ok(corpusCases(prefix).length > 0);
    });
  }

  it('the listener answer names the debuggee', () => {
    assert.equal(
      corpusSidecar('debugger-run-to-line--02-listen').response.status,
      200,
    );
    assert.ok(
      corpusBody('debugger-run-to-line--02-listen').includes('<DEBUGGEE_ID>'),
    );
  });
});
