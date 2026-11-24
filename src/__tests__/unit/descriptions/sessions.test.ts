/**
 * Plan step 10.6, group 8: the sessions', background runs', transports' and
 * abapGit writes' facts (`src/lib/description/sessions.ts`), each generated
 * from the answer type the tool builds — pinned for two tools of different
 * objects, through the one factory (`runParts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  purpose,
  resultReturns,
  toolDescription,
} from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import * as sessions from '../../../lib/description/sessions';
import { factFaults } from './descriptionRules';

describe('the session and transport facts', () => {
  it('a leftover session list and a logoff: the purpose, then the answer', () => {
    assert.equal(
      toolDescription(
        runParts({
          tag: 'read-only',
          purpose: purpose('Lists the leftover SAP sessions.'),
          result: sessions.LEFTOVER_SESSIONS,
        }),
      ),
      '[read-only] Lists the leftover SAP sessions. For each leftover session: its handle, whether it served an instance or a debug session, its destination, its SAP user and when it was last recorded.',
    );
    assert.equal(
      toolDescription(
        runParts({
          purpose: purpose('Logs off a leftover SAP session.'),
          result: sessions.LEFTOVER_LOGGED_OFF,
        }),
      ),
      "Logs off a leftover SAP session. The session's handle and that it is logged off.",
    );
  });

  it('every shape keeps the fact rules', () => {
    for (const shape of Object.values(sessions)) {
      for (const fact of resultReturns(shape)) {
        assert.deepStrictEqual(factFaults(fact.text), [], fact.text);
      }
    }
  });
});
