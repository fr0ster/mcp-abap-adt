/**
 * The function module group checks of several references in ADT batch
 * envelopes (#2, `checkModuleReferences`): a group activation and a
 * `GetWhereUsed` of several `GROUP|FM` targets check each module's group
 * against its metadata. The metadata reads of two or more modules are
 * independent: they go in one envelope (with the consumer's
 * `readsPerEnvelope`, consecutive balanced envelopes of at most that many
 * reads), and the answer is the sequential version's —
 * the first failure in the references' order, a `404` part (a module that
 * does not exist) beside `200` parts included. One module is its one read,
 * sent as itself.
 *
 * Real clients, a real `AdtBatchConnection`; only the connection is a fake,
 * answering envelope parts and direct requests from the same model.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { createBatchAvailability } from '../../../lib/batch/availability';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  checkModuleReferences,
  type ModuleReference,
} from '../../../lib/strategies/functionModuleGroup';
import { rejectionOf } from '../../helpers/assertions';
import {
  envelopeConnection,
  envelopeResponse,
  type InnerRequest,
  type PartAnswer,
  statusError,
} from '../../helpers/batchEnvelope';
import { moduleMetadataDocument } from '../../helpers/functionModuleMetadata';
import { withinTurns } from '../../helpers/withinTurns';

process.env.SAP_SYSTEM_TYPE = 'onprem';

/** What the system answers about a module: the group holding it, or a status. */
type Held = string | PartAnswer;

/** SAP's answer to the metadata read of a module that does not exist (FL 110). */
const NOT_FOUND: PartAnswer = {
  status: 404,
  statusText: 'Not Found',
  headers: { 'content-type': 'application/xml' },
  body: '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNotFound"/><message lang="EN">Function module does not exist</message><localizedMessage lang="EN">Function module does not exist</localizedMessage><properties><entry key="T100KEY-ID">FL</entry><entry key="T100KEY-NO">110</entry></properties></exc:exception>',
};

const FAILED: PartAnswer = {
  status: 500,
  statusText: 'Internal Server Error',
  body: '',
};

/** `group/module` of a metadata read's URL (`/functions/groups/<g>/fmodules/<m>`). */
function labelOf(url: string): string {
  const path = new URL(url, 'https://system.invalid').pathname;
  const parts = path.split('/');
  const at = parts.indexOf('groups');
  return `${parts[at + 1]?.toUpperCase()}/${parts[at + 3]?.toUpperCase()}`;
}

/** The answer of the model to the read of `label` (`group/module`). */
function answerOf(model: Record<string, Held>, label: string): PartAnswer {
  const module = label.split('/')[1] ?? '';
  const held = model[module] ?? label.split('/')[0] ?? '';
  if (typeof held !== 'string') return held;
  return {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/vnd.sap.adt.functions.fmodules+xml',
    },
    body: moduleMetadataDocument(module, held),
  };
}

/**
 * A fake system: every module is in the group its reference names unless
 * `model` says otherwise; `envelope` replaces the envelope's answer.
 */
function system(
  model: Record<string, Held> = {},
  envelope?: (parts: InnerRequest[], index: number) => IAdtWireResponse,
) {
  let sent = 0;
  return envelopeConnection(
    (parts) => {
      sent += 1;
      if (envelope !== undefined) return envelope(parts, sent);
      return envelopeResponse(
        parts.map((p) => answerOf(model, labelOf(p.url))),
      );
    },
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      const a = answerOf(model, labelOf(request.url));
      if (a.status >= 400) {
        throw statusError(
          a.status,
          a.statusText ?? '',
          a.body ?? '',
          a.headers ?? {},
        );
      }
      return {
        status: a.status,
        statusText: a.statusText ?? 'OK',
        headers: a.headers ?? {},
        data: a.body ?? '',
      } as IAdtWireResponse;
    },
  );
}

type Fake = ReturnType<typeof system>;

/**
 * A context on the fake: batch served (default) or known to be absent; the
 * consumer's `readsPerEnvelope` when given.
 */
function contextOn(
  fake: Fake,
  batch: 'served' | 'absent' = 'served',
  readsPerEnvelope?: number,
) {
  const port = createBatchAvailability();
  if (batch === 'absent') port.noteOuterStatus(404);
  const context: HandlerContext = {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: port,
    ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
  };
  return context;
}

/** The consumer's bound the tests below set. */
const BOUND = 300;

const moduleRef = (name: string, group = 'ZFG'): ModuleReference => ({
  type: 'FUGR/FF',
  name,
  parentName: group,
});

const THREE = [moduleRef('ZFM_A'), moduleRef('ZFM_B'), moduleRef('ZFM_C')];

/** Every envelope's parts, as `group/module`, in the order sent. */
const phasesOf = (fake: Fake) =>
  fake.envelopes.map((e) => e.parts.map((p) => labelOf(p.url)));
const directsOf = (fake: Fake) => fake.directs.map((r) => labelOf(r.url));

/** The check's failure as data: its error whole, or `undefined`. */
const verdictOf = (
  checked: Awaited<ReturnType<typeof checkModuleReferences>>,
): unknown =>
  checked === undefined
    ? undefined
    : JSON.parse(JSON.stringify(checked.getError()));

/** The batched check and the sequential one over the same model. */
async function bothWays(
  references: readonly ModuleReference[],
  model: Record<string, Held> = {},
) {
  const batched = system(model);
  const sequential = system(model);
  const a = await withinTurns(
    checkModuleReferences(contextOn(batched), references),
  );
  const b = await withinTurns(
    checkModuleReferences(contextOn(sequential, 'absent'), references),
  );
  return { a: verdictOf(a), b: verdictOf(b), batched, sequential };
}

const credential = () =>
  new AuthRefusedError(
    authError['credential-refused']({ credential: 'token' }),
    'request',
  );

describe('function module group checks of several references (checkModuleReferences)', () => {
  it('three modules: one envelope of their three metadata reads, in order; nothing sent alone', async () => {
    const { a, batched, sequential } = await bothWays(THREE);
    assert.equal(a, undefined);
    assert.deepStrictEqual(phasesOf(batched), [
      ['ZFG/ZFM_A', 'ZFG/ZFM_B', 'ZFG/ZFM_C'],
    ]);
    assert.equal(batched.directs.length, 0);
    assert.deepStrictEqual(directsOf(sequential), [
      'ZFG/ZFM_A',
      'ZFG/ZFM_B',
      'ZFG/ZFM_C',
    ]);
  });

  it('one module is its one read, sent as itself: no envelope', async () => {
    const fake = system();
    const checked = await withinTurns(
      checkModuleReferences(contextOn(fake), [
        moduleRef('ZFM_A'),
        { type: 'CLAS/OC', name: 'ZCL_X' },
      ]),
    );
    assert.equal(checked, undefined);
    assert.equal(fake.envelopes.length, 0);
    assert.deepStrictEqual(directsOf(fake), ['ZFG/ZFM_A']);
  });

  it('references that name no module are not read', async () => {
    const fake = system();
    await withinTurns(
      checkModuleReferences(contextOn(fake), [
        { type: 'CLAS/OC', name: 'ZCL_X' },
        { type: 'FUGR/FF', name: 'ZFM_NO_GROUP' },
      ]),
    );
    assert.equal(fake.envelopes.length, 0);
    assert.equal(fake.directs.length, 0);
  });

  it('a 404 part beside 200 parts: that module is missing — SAP’s 404 with its key, the sequential answer', async () => {
    const { a, b, batched } = await bothWays(THREE, { ZFM_B: NOT_FOUND });
    assert.deepStrictEqual(a, b);
    assert.equal(phasesOf(batched).length, 1);
    const error = Object(a);
    assert.equal(error.step, 'check function group');
    assert.equal(error.response?.status ?? error.status, 404);
  });

  it('a module in another group is refused as the sequential version refuses it', async () => {
    const { a, b } = await bothWays(THREE, { ZFM_C: 'ZOTHER' });
    assert.deepStrictEqual(a, b);
    assert.equal(Object(a).code, 'FUNCTION_GROUP_MISMATCH');
    assert.ok(String(Object(a).message).includes('ZOTHER'));
    // What was sent: the modules' metadata reads — in one envelope, every
    // module's — and nothing else.
    assert.ok(
      String(Object(a).message).endsWith(
        'only function module metadata was read; nothing else was sent.',
      ),
    );
  });

  it('several failures: the first in the references’ order is the answer, as the sequential version', async () => {
    for (const model of [
      { ZFM_B: NOT_FOUND, ZFM_C: 'ZOTHER' },
      { ZFM_B: 'ZOTHER', ZFM_C: NOT_FOUND },
      { ZFM_A: FAILED, ZFM_B: NOT_FOUND },
    ] satisfies Array<Record<string, Held>>) {
      const { a, b } = await bothWays(THREE, model);
      assert.deepStrictEqual(a, b);
    }
  });

  it('an envelope that fails as a whole: the first module’s failure, as the sequential version answers that read failing, naming the envelope’s request', async () => {
    const fake = system({}, () => {
      throw statusError(500, 'Internal Server Error');
    });
    const a = verdictOf(
      await withinTurns(checkModuleReferences(contextOn(fake), THREE)),
    );
    const reference = system({ ZFM_A: FAILED });
    const b = verdictOf(
      await withinTurns(
        checkModuleReferences(contextOn(reference, 'absent'), THREE),
      ),
    );
    const withoutRequest = (v: unknown) =>
      JSON.parse(JSON.stringify(v, (k, x) => (k === 'request' ? null : x)));
    assert.deepStrictEqual(withoutRequest(a), withoutRequest(b));
    assert.equal(Object(a).step, 'check function group');
    assert.equal(fake.envelopes.length, 1);
    assert.equal(fake.directs.length, 0);
  });

  it("the connection's credential refusal ends the check as it came, as the sequential version throws it", async () => {
    const refusal = credential();
    const fake = system({}, () => {
      throw refusal;
    });
    const thrown = await rejectionOf(
      withinTurns(checkModuleReferences(contextOn(fake), THREE)),
    );
    const reference = system();
    reference.answerRequests(async () => {
      throw credential();
    });
    const expected = await rejectionOf(
      withinTurns(checkModuleReferences(contextOn(reference, 'absent'), THREE)),
    );
    assert.equal(
      Object.getPrototypeOf(thrown),
      Object.getPrototypeOf(expected),
    );
    assert.equal(fake.envelopes.length, 1);
  });

  it('no bound given: 302 modules in one envelope', async () => {
    const many = Array.from({ length: BOUND + 2 }, (_, i) =>
      moduleRef(`ZFM_${i}`),
    );
    const fake = system();
    const checked = await withinTurns(
      checkModuleReferences(contextOn(fake), many),
      2000,
    );
    assert.equal(checked, undefined);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      [302],
    );
  });

  it(`the consumer's bound of ${BOUND}: 302 modules in balanced envelopes of 151 and 151`, async () => {
    const many = Array.from({ length: BOUND + 2 }, (_, i) =>
      moduleRef(`ZFM_${i}`),
    );
    const fake = system();
    const checked = await withinTurns(
      checkModuleReferences(contextOn(fake, 'served', BOUND), many),
      2000,
    );
    assert.equal(checked, undefined);
    assert.deepStrictEqual(
      fake.envelopes.map((e) => e.parts.length),
      // Balanced: never a one-read envelope beside a full one.
      [151, 151],
    );
    assert.deepStrictEqual(
      phasesOf(fake).flat(),
      many.map((m) => `ZFG/${m.name}`),
    );
  });

  it('a failure in an envelope: the later envelopes are not sent', async () => {
    const many = Array.from({ length: BOUND + 2 }, (_, i) =>
      moduleRef(`ZFM_${i}`),
    );
    const fake = system({ ZFM_3: 'ZOTHER' });
    const checked = await withinTurns(
      checkModuleReferences(contextOn(fake, 'served', BOUND), many),
      2000,
    );
    assert.equal(Object(verdictOf(checked)).code, 'FUNCTION_GROUP_MISMATCH');
    assert.equal(fake.envelopes.length, 1);
  });

  it('an outer 404: the destination has no communication batch; the sequential reads answer', async () => {
    const fake = system({ ZFM_B: 'ZOTHER' }, () => {
      throw statusError(404, 'Not Found');
    });
    const context = contextOn(fake);
    const a = verdictOf(
      await withinTurns(checkModuleReferences(context, THREE)),
    );
    const { b } = await bothWays(THREE, { ZFM_B: 'ZOTHER' });
    assert.deepStrictEqual(a, b);
    assert.equal(context.batchAvailability?.available(), false);
    assert.deepStrictEqual(directsOf(fake), ['ZFG/ZFM_A', 'ZFG/ZFM_B']);
  });
});
