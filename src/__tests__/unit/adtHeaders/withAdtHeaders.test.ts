/**
 * The server's header pairs (`withAdtHeaders`): the system's kept pair, else
 * the operation's default; a `406` corrected once with the Accept SAP names,
 * a `415` once with the Content-Type it names; the corrected pair kept for
 * the system (`AdtHeaderPairs`), never for the credentials. A call recorded
 * in batch mode is made once.
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import { AdtHeaderPairs } from '../../../lib/adtHeaders/AdtHeaderPairs';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import { asRecordedCall } from '../../../lib/adtHeaders/scope';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  SAP_EXCEPTION_HEADERS,
  unsupportedMediaTypeBody,
} from '../../helpers/sapRefusals';

const OP = 'utils.getWhereUsed';
const DEFAULT = DEFAULT_ADT_HEADERS[OP];
const NEWER =
  'application/vnd.sap.adt.repository.usagereferences.result.v2+xml';
const NEWER_BODY =
  'application/vnd.sap.adt.repository.usagereferences.request.v2+xml';

/** A member's answer: `ok`, or a failure carrying SAP's response. */
const okAnswer = (headers: IAdtHeaders) => ({
  ok: true as const,
  sent: headers,
  getResult: () => ({ value: 'answered' }),
});
const failed = (
  status: number,
  data: string,
  headers: Record<string, string> = {},
) => ({
  ok: false as const,
  getError: () => ({
    origin: 'refusal',
    message: 'refused',
    response: { status, statusText: '', headers, data },
  }),
});
const notAcceptable = (types: string) =>
  failed(
    406,
    `<exc:exception><message>The message content is not acceptable. Accepted content types: ${types}</message></exc:exception>`,
  );

type Answer = ReturnType<typeof okAnswer> | ReturnType<typeof failed>;

/** A member SAP answers by `sap`; every pair it was called with, in order. */
function member(sap: (headers: IAdtHeaders) => Answer) {
  const sent: IAdtHeaders[] = [];
  return {
    sent,
    call: async (headers: IAdtHeaders) => {
      sent.push(headers);
      return sap(headers);
    },
  };
}

/** SAP serving only `NEWER` as the Accept. */
const acceptsNewer = (headers: IAdtHeaders): Answer =>
  headers.accept === NEWER ? okAnswer(headers) : notAcceptable(NEWER);

describe('withAdtHeaders', () => {
  it('sends the default pair when the system has none kept', async () => {
    const pairs = new AdtHeaderPairs();
    const m = member(okAnswer);
    await withAdtHeaders({ adtHeaders: pairs.forSystem('S1') }, OP, m.call);
    expect(m.sent).toEqual([DEFAULT]);
  });

  it('sends the kept pair when the system has one', async () => {
    const pairs = new AdtHeaderPairs();
    const port = pairs.forSystem('S1');
    const kept = { accept: NEWER, contentType: NEWER_BODY };
    port.remember(OP, kept);
    const m = member(okAnswer);
    await withAdtHeaders({ adtHeaders: port }, OP, m.call);
    expect(m.sent).toEqual([kept]);
  });

  it('a 406 naming a type is sent once more with it as the Accept, kept; the next call sends it directly', async () => {
    const pairs = new AdtHeaderPairs();
    const context = { adtHeaders: pairs.forSystem('S1') };
    const m = member(acceptsNewer);
    const answer = await withAdtHeaders(context, OP, m.call);
    expect(answer.ok).toBe(true);
    expect(m.sent).toEqual([
      DEFAULT,
      { accept: NEWER, contentType: DEFAULT.contentType },
    ]);
    expect(pairs.forSystem('S1').pairFor(OP)).toEqual({
      accept: NEWER,
      contentType: DEFAULT.contentType,
    });
    await withAdtHeaders(context, OP, m.call);
    expect(m.sent).toHaveLength(3);
    expect(m.sent[2]).toEqual({
      accept: NEWER,
      contentType: DEFAULT.contentType,
    });
  });

  it('several types a 406 names are the Accept, joined', async () => {
    const m = member((headers) =>
      headers.accept === `${NEWER}, application/xml`
        ? okAnswer(headers)
        : notAcceptable(`${NEWER}, application/xml`),
    );
    await withAdtHeaders({}, OP, m.call);
    expect(m.sent[1]?.accept).toBe(`${NEWER}, application/xml`);
  });

  it("SAP's 415 naming a type is sent once more with it as the Content-Type, kept; its own application/xml never", async () => {
    const pairs = new AdtHeaderPairs();
    const context = { adtHeaders: pairs.forSystem('S1') };
    const m = member((headers) =>
      headers.contentType === NEWER_BODY
        ? okAnswer(headers)
        : failed(
            415,
            unsupportedMediaTypeBody(NEWER_BODY),
            SAP_EXCEPTION_HEADERS,
          ),
    );
    const answer = await withAdtHeaders(context, OP, m.call);
    expect(answer.ok).toBe(true);
    expect(m.sent).toEqual([
      DEFAULT,
      { accept: DEFAULT.accept, contentType: NEWER_BODY },
    ]);
    expect(m.sent.map((h) => h.contentType)).not.toContain('application/xml');
    expect(pairs.forSystem('S1').pairFor(OP)).toEqual({
      accept: DEFAULT.accept,
      contentType: NEWER_BODY,
    });
    await withAdtHeaders(context, OP, m.call);
    expect(m.sent).toHaveLength(3);
    expect(m.sent[2]).toEqual({
      accept: DEFAULT.accept,
      contentType: NEWER_BODY,
    });
  });

  it('a bare "Unsupported Media Type" is the answer: nothing sent again, nothing kept', async () => {
    const pairs = new AdtHeaderPairs();
    const m = member(() =>
      failed(415, unsupportedMediaTypeBody(), SAP_EXCEPTION_HEADERS),
    );
    const answer = await withAdtHeaders(
      { adtHeaders: pairs.forSystem('S1') },
      OP,
      m.call,
    );
    expect(answer.ok).toBe(false);
    expect(m.sent).toEqual([DEFAULT]);
    expect(pairs.forSystem('S1').pairFor(OP)).toEqual(DEFAULT);
  });

  it('a 406 naming no type is the answer: nothing sent again, nothing kept', async () => {
    const pairs = new AdtHeaderPairs();
    const m = member(() => notAcceptable(''));
    const answer = await withAdtHeaders(
      { adtHeaders: pairs.forSystem('S1') },
      OP,
      m.call,
    );
    expect(answer.ok).toBe(false);
    expect(m.sent).toEqual([DEFAULT]);
    expect(pairs.forSystem('S1').pairFor(OP)).toEqual(DEFAULT);
  });

  it('a 406 naming the Accept sent is the answer: nothing sent again', async () => {
    const m = member(() => notAcceptable(DEFAULT.accept));
    const answer = await withAdtHeaders({}, OP, m.call);
    expect(answer.ok).toBe(false);
    expect(m.sent).toEqual([DEFAULT]);
  });

  it("the second call's answer is the call's answer, a second 406 included: one round", async () => {
    const m = member((headers) =>
      notAcceptable(headers.accept === NEWER ? 'application/xml' : NEWER),
    );
    const answer = await withAdtHeaders({}, OP, m.call);
    expect(answer.ok).toBe(false);
    expect(m.sent).toHaveLength(2);
  });

  it('a status other than 406/415 is the answer', async () => {
    const m = member(() => failed(404, 'Accepted content types: x/y'));
    await withAdtHeaders({}, OP, m.call);
    expect(m.sent).toHaveLength(1);
  });

  it('a call recorded in batch mode is made once: its 406 is its answer', async () => {
    const pairs = new AdtHeaderPairs();
    const m = member(acceptsNewer);
    const answer = await asRecordedCall(() =>
      withAdtHeaders({ adtHeaders: pairs.forSystem('S1') }, OP, m.call),
    );
    expect(answer.ok).toBe(false);
    expect(m.sent).toEqual([DEFAULT]);
    expect(pairs.forSystem('S1').pairFor(OP)).toEqual(DEFAULT);
  });

  it("the kept pair is the system's: shared by its ports, apart from another system's", async () => {
    const pairs = new AdtHeaderPairs();
    await withAdtHeaders(
      { adtHeaders: pairs.forSystem('S1') },
      OP,
      member(acceptsNewer).call,
    );
    const sameSystem = member(acceptsNewer);
    await withAdtHeaders(
      { adtHeaders: pairs.forSystem('S1') },
      OP,
      sameSystem.call,
    );
    expect(sameSystem.sent).toEqual([
      { accept: NEWER, contentType: DEFAULT.contentType },
    ]);
    const otherSystem = member(acceptsNewer);
    await withAdtHeaders(
      { adtHeaders: pairs.forSystem('S2') },
      OP,
      otherSystem.call,
    );
    expect(otherSystem.sent[0]).toEqual(DEFAULT);
  });

  it('the kept pair is per operation', async () => {
    const pairs = new AdtHeaderPairs();
    const port = pairs.forSystem('S1');
    await withAdtHeaders({ adtHeaders: port }, OP, member(acceptsNewer).call);
    expect(port.pairFor('utils.getWhereUsedScope')).toEqual(
      DEFAULT_ADT_HEADERS['utils.getWhereUsedScope'],
    );
  });
});
