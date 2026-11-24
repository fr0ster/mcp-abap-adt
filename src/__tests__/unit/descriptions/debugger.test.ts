/**
 * Plan step 10.6, group 9: the debugger tools' facts
 * (`src/lib/description/debugger.ts`), each generated from a debugger
 * answer type — pinned for two tools of different actions, through the one
 * factory (`runParts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  purpose,
  resultReturns,
  toolDescription,
} from '../../../lib/description';
import * as debuggerFacts from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { factFaults } from './descriptionRules';

describe('the debugger facts', () => {
  it('a breakpoint removal and a settings change: the action, then its answer', () => {
    assert.equal(
      toolDescription(
        runParts({
          tag: 'debug',
          purpose: purpose('Removes one breakpoint by its id.'),
          result: debuggerFacts.DELETED,
        }),
      ),
      '[debug] Removes one breakpoint by its id. The id deleted.',
    );
    assert.equal(
      toolDescription(
        runParts({
          tag: 'debug',
          purpose: purpose('Changes the debugger settings.'),
          result: debuggerFacts.SETTINGS,
        }),
      ),
      '[debug] Changes the debugger settings. Whether system programs are debugged, whether update tasks are debugged, whether exception objects are created, whether background RFC is debugged and whether shared objects are debugged.',
    );
  });

  it('every shape keeps the fact rules', () => {
    for (const shape of Object.values(debuggerFacts)) {
      for (const fact of resultReturns(shape)) {
        assert.deepStrictEqual(factFaults(fact.text), [], fact.text);
      }
    }
  });
});
