/**
 * Every entry of `tools/batch-handlers.json` sends requests none of which
 * needs another's answer (the owner, 2026-10-16): a recorded call's answers
 * come only at the batch's end, so a request built from an earlier answer — a
 * create then its activation, a fallback after a `404`, a poll — could never
 * be sent. Real adt-clients code runs; nothing of it is doubled.
 *
 * Each sample call (`batchEntryCases.ts`) runs through its served handler
 * three times against a counting connection (`batchHarness.ts`):
 *
 * - held open (`pending`, no request ever answered): k requests go out;
 * - answered with a document (a captured metadata document where the corpus
 *   has one, a lock handle for a lock, a run's `Location`, the case's own
 *   body, else `200` with an empty body): n requests, and no error — a
 *   handler that reads a first document to build a second request sends it
 *   only here;
 * - answered `404`: n requests too — a fallback after a refusal shows here.
 *
 * Eligible: the same requests in all three runs, at least one — and all of
 * one session kind (`requestKind`, as a batch reads it: LOCK, UNLOCK or
 * stateless), so a recorded call never needs two kinds of batch: a batch
 * holds one kind, and every batch end sends one envelope.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  type BatchSet,
  batchEntries,
  eligible,
} from '../../../lib/batch/eligibility';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { BATCH_ENTRY_CASES } from '../../helpers/batchEntryCases';
import { runCase, servedTools } from '../../helpers/batchHarness';
import { silentLogger } from '../../helpers/lowToCompact';
import { setSystemContext } from '../../helpers/processSystemContext';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/** The set whose entries name `tool`: a tool is served by one set alone. */
const setOf = (tool: string): BatchSet =>
  batchEntries().find((entry) => entry.tool === tool)?.set ?? 'compact';

describe('no request of a batch entry waits for another answer', () => {
  const context = {
    connection: undefined,
    logger: silentLogger,
  } as unknown as HandlerContext;
  const tools = servedTools(context);

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  const cases = BATCH_ENTRY_CASES.map(
    (c) => [`${c.tool} ${JSON.stringify(c.args)}`, c] as const,
  );

  for (const [_name, c] of cases) {
    it(format('%s: the table admits it', _name), () => {
      assert.deepStrictEqual(
        eligible(c.tool, c.args, c.connection ?? 'http', setOf(c.tool)),
        {
          ok: true,
        },
      );
    });
  }

  for (const [_name, c] of cases) {
    it(
      format(
        '%s: every request goes out before any answer, all of one session kind, the same answered with a document or 404',
        _name,
      ),
      async () => {
        const held = await runCase(tools, context, c, 'pending');
        const documented = await runCase(tools, context, c, 'document');
        const refused = await runCase(tools, context, c, 'not-found');
        assert.deepStrictEqual(
          {
            oneKind: new Set(held.kinds).size,
            held: held.sent.length >= 1,
            document: documented.sent,
            notFound: refused.sent,
            threw:
              documented.threw === undefined
                ? undefined
                : String(documented.threw),
            isError:
              documented.answer?.isError === true
                ? documented.answer.content?.[0]?.text
                : false,
          },
          {
            oneKind: 1,
            held: true,
            document: held.sent,
            notFound: held.sent,
            threw: undefined,
            isError: false,
          },
        );
      },
    );
  }
});
