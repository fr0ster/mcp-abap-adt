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
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleHandlerGet } from '../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { RUN_START_WITHOUT_ID } from '../../../src/handlers/common/low/handleActivateObject';
import { corpusBody } from '../../../src/lib/adtCorpus';
import { handleHandlerActivate } from '../handlers/handleHandlerActivate';

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
  [
    'objects[] of one function module at its group',
    { objects: [{ name: 'FM_A', type: 'FUGR/FF', parentName: 'FUGR_A' }] },
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

describe('compact HandlerActivate: an activation run is started in one request', () => {
  describe.each(RUN_CALLS)('%s', (_label, args) => {
    it('HandlerActivate run path issues exactly one request and answers the run_id', async () => {
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => activate(mode, args)),
      );
      expect(held.sent).toHaveLength(1);
      expect(held.sent[0].startsWith(RUN_POST)).toBe(true);
      expect(documented.sent).toEqual(held.sent);
      expect(refused.sent).toEqual(held.sent);

      expect(documented.answer?.isError).not.toBe(true);
      expect(jsonOf(documented.answer)).toEqual({ run_id: 'RUN_PLACEHOLDER' });
      expect(refused.answer?.isError).toBe(true);
      expect(jsonOf(refused.answer).status).toBe(404);
      expect(jsonOf(refused.answer).step).toBe('start activation run');
    });

    it('a 2xx without Location is a failure with its step, one request', async () => {
      const { sent, answer } = await activate('document', args, undefined, {
        location: '',
      });
      expect(sent).toHaveLength(1);
      expect(answer?.isError).toBe(true);
      const failed = jsonOf(answer);
      expect(failed.message).toBe(RUN_START_WITHOUT_ID);
      expect(failed.step).toBe('start activation run');
      expect(failed).not.toHaveProperty('run_id');
    });

    it('no poll, no timer', async () => {
      const timer = jest.spyOn(global, 'setTimeout');
      try {
        const { sent } = await activate('document', args);
        expect(sent).toHaveLength(1);
        expect(
          sent.some((line) => line.includes('/activation/runs/RUN_PLACEHOLDER')),
        ).toBe(false);
        expect(sent.some((line) => line.includes('/activation/results'))).toBe(
          false,
        );
        expect(timer).not.toHaveBeenCalled();
      } finally {
        timer.mockRestore();
      }
    });
  });

  it('the single-object path is unchanged (one request)', async () => {
    const args = { object_type: 'CLASS', object_name: 'CLAS_A' };
    const body = corpusBody('activation-success-verdict--01-activation');
    const [held, documented, refused] = await Promise.all(
      MODES.map((mode) => activate(mode, args, body)),
    );
    expect(held.sent).toHaveLength(1);
    expect(
      held.sent[0].startsWith('POST /sap/bc/adt/activation?method=activate'),
    ).toBe(true);
    expect(documented.sent).toEqual(held.sent);
    expect(refused.sent).toEqual(held.sent);
    expect(documented.answer?.isError).not.toBe(true);
    expect(jsonOf(documented.answer)).not.toHaveProperty('run_id');
  });
});

describe('compact HandlerGet: the activation run read by run_id', () => {
  it.each([
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
  ])('activation_status and activation_results: one request each, SAP\'s answer as it came (%s)', async (part, request, body) => {
    const args = { part, run_id: 'RUN_A' };
    const [held, documented, refused] = await Promise.all(
      MODES.map((mode) => get(mode, args, body)),
    );
    expect(held.sent).toEqual([request]);
    expect(documented.sent).toEqual(held.sent);
    expect(refused.sent).toEqual(held.sent);

    expect(documented.answer?.isError).not.toBe(true);
    const answered = jsonOf(documented.answer);
    expect(answered.run_id).toBe('RUN_A');
    expect(answered.part).toBe(part);
    expect(answered.document).toBe(body);

    expect(refused.answer?.isError).toBe(true);
    expect(jsonOf(refused.answer).status).toBe(404);
  });

  it('activation_status answers the run status as SAP stated it', async () => {
    const { answer } = await get(
      'document',
      { part: 'activation_status', run_id: 'RUN_A' },
      STATUS_DOCUMENT,
    );
    expect(jsonOf(answer).status).toBe('finished');
  });

  it('activation_results answers the messages the run produced', async () => {
    const { answer } = await get(
      'document',
      { part: 'activation_results', run_id: 'RUN_A' },
      RESULTS_DOCUMENT,
    );
    const messages = jsonOf(answer).messages as Array<{ type: string }>;
    expect(messages.length).toBeGreaterThan(0);
  });

  it.each([
    'activation_status',
    'activation_results',
  ])('%s without run_id is refused before any request', async (part) => {
    const { sent, answer } = await get('document', { part });
    expect(sent).toEqual([]);
    expect(answer?.isError).toBe(true);
    expect(textOf(answer)).toContain('run_id');
  });
});
