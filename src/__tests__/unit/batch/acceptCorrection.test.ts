/**
 * The 406 correction of an internal batch phase (`runPhase`): the parts SAP
 * answered `406` go, right after the phase's envelope answered, in one
 * envelope of their own, each with the Accept its own `406` names; the
 * corrected Accept is stored in the connection's accept cache, the cache the
 * correction outside a batch uses, and a later part sends it directly.
 *
 * Real `AdtBatchConnection` and real accept negotiation (adt-clients 35);
 * only the connection is a fake, answering every request — an envelope's
 * part or a request outside a batch — from one model of SAP.
 */

import { AdtClient, cachedAccept } from '@mcp-abap-adt/adt-clients';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { runPhase } from '../../../lib/batch/phases';
import { switchAcceptCorrectionOn } from '../../../lib/connectionFactory';
import {
  envelopeConnection,
  type PartAnswer,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const OLD = 'application/vnd.sap.probe.v1+xml';
const NEW = 'application/vnd.sap.probe.v2+xml';
const ITEMS = ['ITEM_A', 'ITEM_B', 'ITEM_C'] as const;
const urlOf = (item: string) => `/sap/bc/adt/probe/${item.toLowerCase()}`;

/** One GET per item with the old Accept; its answer's body the value. */
const read = async (item: string, connection: IAbapConnection) => {
  const response = await connection.makeAdtRequest<string>({
    url: urlOf(item),
    method: 'GET',
    timeout: 0,
    headers: { Accept: OLD },
  });
  return response.data;
};

const NOT_ACCEPTABLE = { status: 406, statusText: 'Not Acceptable' };

/**
 * SAP: `item_b` serves only `NEW`, and answers any other Accept `406`
 * naming it (`supported`, by default the header `adt-clients` reads); every
 * other item serves any Accept.
 */
function model(
  supported: Record<string, string> = { 'x-sap-adt-supported-accept': NEW },
) {
  return (url: string, accept: string | undefined): PartAnswer =>
    url.endsWith('item_b') && accept !== NEW
      ? { ...NOT_ACCEPTABLE, headers: supported, body: '' }
      : { status: 200, statusText: 'OK', body: `${url} as ${accept}` };
}

const acceptOf = (headers: Record<string, unknown> | undefined) => {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === 'accept') return String(value);
  }
  return undefined;
};

/** A fake answering envelope parts and direct requests from `sap`. */
function system(sap: ReturnType<typeof model>) {
  return envelopeConnection(
    partByPart((inner) => sap(inner.url, inner.headers.accept)),
    async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
      const answer = sap(
        request.url,
        acceptOf(request.headers as Record<string, unknown>),
      );
      if (answer.status >= 400) {
        throw statusError(
          answer.status,
          answer.statusText ?? '',
          answer.body ?? '',
          answer.headers ?? {},
        );
      }
      return {
        status: answer.status,
        statusText: answer.statusText ?? 'OK',
        headers: answer.headers ?? {},
        data: answer.body ?? '',
      } as IAdtWireResponse;
    },
  );
}

type Fake = ReturnType<typeof system>;

const contextOn = (fake: Fake): HandlerContext =>
  ({
    connection: fake.connection,
    logger: undefined,
  }) as unknown as HandlerContext;

/** The server's connection outside a batch: correction switched on, as the server switches it. */
function negotiated(fake: Fake): IAbapConnection {
  const connection = fake.connection as unknown as IAbapConnection;
  switchAcceptCorrectionOn(connection);
  // A client built later, as a handler builds one.
  new AdtClient(connection, undefined);
  return connection;
}

const envelopeParts = (fake: Fake) =>
  fake.envelopes.map((e) => e.parts.map((p) => [p.url, p.headers.accept]));

const phase = (fake: Fake) =>
  withinTurns(runPhase(contextOn(fake), ITEMS, read));

describe('the 406 correction of an internal batch phase', () => {
  it('only the 406 part goes in one correction envelope, with the Accept its 406 names', async () => {
    const fake = system(model());
    const results = await phase(fake);

    expect(envelopeParts(fake)).toEqual([
      [
        [urlOf('ITEM_A'), OLD],
        [urlOf('ITEM_B'), OLD],
        [urlOf('ITEM_C'), OLD],
      ],
      [[urlOf('ITEM_B'), NEW]],
    ]);
    expect(fake.directs).toHaveLength(0);
    expect(results).toEqual([
      { ok: true, value: `${urlOf('ITEM_A')} as ${OLD}` },
      { ok: true, value: `${urlOf('ITEM_B')} as ${NEW}` },
      { ok: true, value: `${urlOf('ITEM_C')} as ${OLD}` },
    ]);
  });

  it('the answers equal the sequential answers for the same SAP', async () => {
    const batched = system(model());
    const results = await phase(batched);

    const sequential = system(model());
    const connection = negotiated(sequential);
    const values: string[] = [];
    for (const item of ITEMS) values.push(await read(item, connection));

    expect(results).toEqual(values.map((value) => ({ ok: true, value })));
  });

  it('the corrected Accept is in the connection’s cache; a later phase sends it directly', async () => {
    const fake = system(model());
    await phase(fake);
    expect(
      cachedAccept(fake.connection as unknown as IAbapConnection, {
        url: urlOf('ITEM_B'),
        method: 'GET',
        timeout: 0,
      }),
    ).toBe(NEW);

    const results = await phase(fake);
    expect(envelopeParts(fake).slice(2)).toEqual([
      [
        [urlOf('ITEM_A'), OLD],
        [urlOf('ITEM_B'), NEW],
        [urlOf('ITEM_C'), OLD],
      ],
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('a correction learned outside a batch is sent by a batched part', async () => {
    const fake = system(model());
    const connection = negotiated(fake);
    await read('ITEM_B', connection);
    expect(fake.directs.map((r) => acceptOf(r.headers as never))).toEqual([
      OLD,
      NEW,
    ]);

    const results = await phase(fake);
    expect(envelopeParts(fake)).toEqual([
      [
        [urlOf('ITEM_A'), OLD],
        [urlOf('ITEM_B'), NEW],
        [urlOf('ITEM_C'), OLD],
      ],
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('a correction learned in a batch is sent outside it', async () => {
    const fake = system(model());
    await phase(fake);
    const connection = negotiated(fake);
    const value = await read('ITEM_B', connection);
    expect(value).toBe(`${urlOf('ITEM_B')} as ${NEW}`);
    expect(fake.directs.map((r) => acceptOf(r.headers as never))).toEqual([
      NEW,
    ]);
  });

  it('a 406 naming no supported type stays the part’s 406; no correction envelope', async () => {
    const fake = system(model({}));
    const results = await phase(fake);
    expect(fake.envelopes).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    expect(results[2]?.ok).toBe(true);
    const failed = results[1] as {
      ok: false;
      error: { response?: { status?: number } };
    };
    expect(failed.ok).toBe(false);
    expect(failed.error.response?.status).toBe(406);
  });

  it('a 406 naming the Accept the part sent stays the part’s 406; no correction envelope', async () => {
    const fake = system(model({ 'x-sap-adt-supported-accept': OLD }));
    const results = await phase(fake);
    expect(fake.envelopes).toHaveLength(1);
    const failed = results[1] as {
      ok: false;
      error: { response?: { status?: number } };
    };
    expect(failed.error.response?.status).toBe(406);
  });

  it('the correction envelope’s answer is the part’s answer, a second 406 included; one round', async () => {
    // SAP names NEW and refuses it too.
    const sap = (url: string, accept: string | undefined): PartAnswer =>
      url.endsWith('item_b')
        ? {
            ...NOT_ACCEPTABLE,
            headers: { 'x-sap-adt-supported-accept': NEW },
            body: accept === NEW ? 'second' : 'first',
          }
        : { status: 200, statusText: 'OK', body: url };
    const fake = system(sap);
    const results = await phase(fake);
    expect(envelopeParts(fake)).toEqual([
      [
        [urlOf('ITEM_A'), OLD],
        [urlOf('ITEM_B'), OLD],
        [urlOf('ITEM_C'), OLD],
      ],
      [[urlOf('ITEM_B'), NEW]],
    ]);
    const failed = results[1] as {
      ok: false;
      error: { response?: { status?: number; data?: string } };
    };
    expect(failed.error.response?.status).toBe(406);
    // The correction's answer, not the first one.
    expect(failed.error.response?.data).toBe('second');
  });
});
