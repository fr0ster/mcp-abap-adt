/**
 * Compact `HandlerActivate` and an activation run (spec §4.6, the owner's
 * rule: compact is one ADT request per tool call; the consumer chains and
 * polls).
 *
 * - The run path — `objects[]`, `object_adt_type`, and the single types the
 *   per-object activation does not map — is the one `POST
 *   /sap/bc/adt/activation/runs`, answered `{ run_id }`: accepted, no
 *   verdict yet. No status read, no results read, no timer.
 * - The single-object path stays the one `POST /sap/bc/adt/activation`.
 * - `HandlerGet` `part: 'activation_status'` and `part: 'activation_results'`
 *   read the run by `run_id`: one request each, SAP's document as it came.
 *
 * Real adt-clients code runs over the batch proof's counting connection, held
 * open, answered with a document and answered `404` alike.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleHandlerGet } from '../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { corpusBody } from '../../../src/__tests__/helpers/adtCorpus';
import { assertNoProperty } from '../../../src/__tests__/helpers/assertions';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { RUN_START_WITHOUT_ID } from '../../../src/handlers/common/low/handleActivateObject';
import { handleHandlerActivate } from '../handlers/handleHandlerActivate';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: string[]; answer?: Answer };

async function runWith(
  handler: (context: HandlerContext, args: never) => unknown,
  mode: Mode,
  args: Record<string, unknown>,
  body?: string,
  headers?: Record<string, string>,
): Promise<Run> {
  const counting = countingConnection(mode, body, headers);
  const context = {
    connection: counting.connection,
    logger: silent,
  } as unknown as HandlerContext;
  const pending = Promise.resolve(
    handler(context, structuredClone(args) as never),
  ) as Promise<Answer>;
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...counting.sent] };
  }
  const answer = await pending.catch((thrown: unknown) => ({
    isError: true,
    content: [{ text: String(thrown) }],
  }));
  return { sent: counting.sent, answer };
}

const activate = (
  mode: Mode,
  args: Record<string, unknown>,
  body?: string,
  headers?: Record<string, string>,
) => runWith(handleHandlerActivate as never, mode, args, body, headers);
const get = (mode: Mode, args: Record<string, unknown>, body?: string) =>
  runWith(handleHandlerGet as never, mode, args, body);

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';
const jsonOf = (answer?: Answer) =>
  JSON.parse(textOf(answer)) as Record<string, unknown>;

const MODES: Mode[] = ['pending', 'document', 'not-found'];

const RUN_POST = 'POST /sap/bc/adt/activation/runs?method=activate';

/** The calls that start an activation run. */
const RUN_CALLS: Array<[string, Record<string, unknown>]> = [
  [
    'objects[] of two',
    {
      objects: [
        { name: 'DDL_A', type: 'DDLS/DF' },
        { name: 'BDEF_A', type: 'BDEF/BDO' },
      ],
    },
  ],
  ['object_adt_type', { object_name: 'SRVB_A', object_adt_type: 'SRVB/SVB' }],
  ['PACKAGE', { object_type: 'PACKAGE', object_name: 'PKG_A' }],
  [
    'SERVICE_DEFINITION',
    { object_type: 'SERVICE_DEFINITION', object_name: 'SRVD_A' },
  ],
  [
    'SERVICE_BINDING',
    { object_type: 'SERVICE_BINDING', object_name: 'SRVB_A' },
  ],
];

const STATUS_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/backgroundrun" runs:status="finished"/>';
const RESULTS_DOCUMENT = corpusBody('refusal-activation-fails--01-activation');

/**
 * A function module's group is checked first (#2: SAP ignores the group of a
 * module's address): its metadata read at the group given, then the one run
 * start when that group holds it. The corpus module, at its group.
 */
describe('compact HandlerActivate: a function module, its group checked, then the one run start', () => {
  const metadata =
    'GET /sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=workingArea';
  for (const [_label, args] of [
    [
      'objects[] of one function module at its group',
      {
        objects: [
          {
            name: 'Z_MCP_SHR_FM',
            type: 'FUGR/FF',
            parentName: 'ZMCP_SHR_FGRP',
          },
        ],
      },
    ],
    [
      'FUNCTION_MODULE named GROUP|MODULE',
      {
        object_type: 'FUNCTION_MODULE',
        object_name: 'ZMCP_SHR_FGRP|Z_MCP_SHR_FM',
      },
    ],
  ] satisfies [string, Record<string, unknown>][]) {
    it(format('%s', _label), async () => {
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => activate(mode, args)),
      );
      assert.deepStrictEqual(held.sent, [metadata]);
      assert.equal(documented.sent.length, 2);
      assert.equal(documented.sent[0], metadata);
      assert.equal(documented.sent[1]?.startsWith(RUN_POST), true);
      assert.deepStrictEqual(jsonOf(documented.answer), {
        run_id: 'RUN_PLACEHOLDER',
      });
      // SAP refused the metadata read: no run is started.
      assert.deepStrictEqual(refused.sent, [metadata]);
      assert.equal(refused.answer?.isError, true);
      assert.equal(jsonOf(refused.answer).step, 'check function group');
    });
  }
});

describe('compact HandlerActivate: an activation run is started in one request', () => {
  for (const [_label, args] of RUN_CALLS) {
    describe(format('%s', _label), () => {
      it('HandlerActivate run path issues exactly one request and answers the run_id', async () => {
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => activate(mode, args)),
        );
        assert.equal(held.sent.length, 1);
        assert.equal(held.sent[0].startsWith(RUN_POST), true);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);

        assert.notEqual(documented.answer?.isError, true);
        assert.deepStrictEqual(jsonOf(documented.answer), {
          run_id: 'RUN_PLACEHOLDER',
        });
        assert.equal(refused.answer?.isError, true);
        assert.equal(jsonOf(refused.answer).status, 404);
        assert.equal(jsonOf(refused.answer).step, 'start activation run');
      });

      it('a 2xx without Location is a failure with its step, one request', async () => {
        const { sent, answer } = await activate('document', args, undefined, {
          location: '',
        });
        assert.equal(sent.length, 1);
        assert.equal(answer?.isError, true);
        const failed = jsonOf(answer);
        assert.equal(failed.message, RUN_START_WITHOUT_ID);
        assert.equal(failed.step, 'start activation run');
        assertNoProperty(failed, 'run_id');
      });

      it('no poll, no timer', async (t) => {
        const timer = t.mock.method(global, 'setTimeout');
        try {
          const { sent } = await activate('document', args);
          assert.equal(sent.length, 1);
          assert.equal(
            sent.some((line) =>
              line.includes('/activation/runs/RUN_PLACEHOLDER'),
            ),
            false,
          );
          assert.equal(
            sent.some((line) => line.includes('/activation/results')),
            false,
          );
          assert.equal(timer.mock.callCount(), 0);
        } finally {
          timer.mock.restore();
        }
      });
    });
  }

  it('the single-object path is unchanged (one request)', async () => {
    const args = { object_type: 'CLASS', object_name: 'CLAS_A' };
    const body = corpusBody('activation-success-verdict--01-activation');
    const [held, documented, refused] = await Promise.all(
      MODES.map((mode) => activate(mode, args, body)),
    );
    assert.equal(held.sent.length, 1);
    assert.equal(
      held.sent[0].startsWith('POST /sap/bc/adt/activation?method=activate'),
      true,
    );
    assert.deepStrictEqual(documented.sent, held.sent);
    assert.deepStrictEqual(refused.sent, held.sent);
    assert.notEqual(documented.answer?.isError, true);
    assertNoProperty(jsonOf(documented.answer), 'run_id');
  });
});

describe('compact HandlerGet: the activation run read by run_id', () => {
  for (const [part, request, body] of [
    [
      'activation_status',
      'GET /sap/bc/adt/activation/runs/RUN_A',
      STATUS_DOCUMENT,
    ],
    [
      'activation_results',
      'GET /sap/bc/adt/activation/results/RUN_A',
      RESULTS_DOCUMENT,
    ],
  ]) {
    it(
      format(
        "activation_status and activation_results: one request each, SAP's answer as it came (%s)",
        part,
      ),
      async () => {
        const args = { part, run_id: 'RUN_A' };
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => get(mode, args, body)),
        );
        assert.deepStrictEqual(held.sent, [request]);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);

        assert.notEqual(documented.answer?.isError, true);
        const answered = jsonOf(documented.answer);
        assert.equal(answered.run_id, 'RUN_A');
        assert.equal(answered.part, part);
        assert.equal(answered.document, body);

        assert.equal(refused.answer?.isError, true);
        assert.equal(jsonOf(refused.answer).status, 404);
      },
    );
  }

  it('activation_status answers the run status as SAP stated it', async () => {
    const { answer } = await get(
      'document',
      { part: 'activation_status', run_id: 'RUN_A' },
      STATUS_DOCUMENT,
    );
    assert.equal(jsonOf(answer).status, 'finished');
  });

  it('activation_results answers the messages the run produced', async () => {
    const { answer } = await get(
      'document',
      { part: 'activation_results', run_id: 'RUN_A' },
      RESULTS_DOCUMENT,
    );
    const messages = jsonOf(answer).messages as Array<{ type: string }>;
    assert.ok(messages.length > 0);
  });

  for (const part of ['activation_status', 'activation_results']) {
    it(
      format('%s without run_id is refused before any request', part),
      async () => {
        const { sent, answer } = await get('document', { part });
        assert.deepStrictEqual(sent, []);
        assert.equal(answer?.isError, true);
        assert.ok(textOf(answer).includes('run_id'));
      },
    );
  }
});
