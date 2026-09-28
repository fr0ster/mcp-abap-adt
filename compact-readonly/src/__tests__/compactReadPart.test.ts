/**
 * `HandlerGet`'s `part`: source, metadata or urls — and a refusal when the object has
 * no such part.
 *
 * **Why a part and not a tool.** Compact is one tool per operation, so "which aspect
 * of this object" is an argument of the read, not a twenty-third tool.
 *
 * **And the refusal matters as much as the routing.** Answering the source when
 * `metadata` was asked would be a success that means something else — the failure
 * this surface keeps producing whenever nobody looks. So a missing part throws, and
 * the message names the parts the type does offer, which is what lets a caller
 * correct itself in one step.
 */
import {
  compactMetadataRoutes,
  compactUrlRoutes,
  partsFor,
} from '../handlers/compactPartRoutes';
import { handleHandlerGet } from '../handlers/handleHandlerGet';

/** The refusal text, out of the answer the tool returns. */
const refusalOf = async (args: Record<string, unknown>) => {
  const answered = (await handleHandlerGet(
    { connection: { getSessionId: () => null }, logger: undefined } as never,
    args as never,
  )) as { isError?: boolean; content?: { text: string }[] };
  return answered.content?.[0]?.text ?? '';
};

const context = {
  connection: { getSessionId: () => null },
  logger: undefined,
} as never;

describe('the parts a compact read can answer', () => {
  it('routes urls only where a service URL exists', () => {
    // One entry, and that is the honest size of it.
    expect(Object.keys(compactUrlRoutes)).toEqual(['SERVICE_BINDING']);
  });

  it('routes metadata for the types whose documents carry one', () => {
    expect(compactMetadataRoutes.CLASS).toBeDefined();
    expect(compactMetadataRoutes.SERVICE_BINDING).toBeDefined();
    // A transport and a test run have no metadata document, and the map saying so
    // is what produces the refusal.
    expect(compactMetadataRoutes.TRANSPORT).toBeUndefined();
    expect(compactMetadataRoutes.UNIT_TEST).toBeUndefined();
  });

  it('lists what a type offers, so a refusal is actionable', () => {
    expect(partsFor('SERVICE_BINDING' as never, true)).toEqual([
      'source',
      'metadata',
      'urls',
    ]);
    expect(partsFor('CLASS' as never, true)).toEqual(['source', 'metadata']);
    expect(partsFor('TRANSPORT' as never, true)).toEqual(['source']);
  });

  it('refuses a part the type does not have, naming the ones it does', async () => {
    // A class has a source and a metadata document, and no service URL.
    expect(
      await refusalOf({ object_type: 'CLASS', part: 'urls', class_name: 'X' }),
    ).toMatch(
      /part=urls is not available[\s\S]*CLASS[\s\S]*offers: source, metadata/,
    );
  });

  it('says "nothing" when the type has no readable part at all', async () => {
    // Measured, not assumed: the compact read map has no `get` for a transport —
    // the CRUD matrix gives it `create` only — so there is nothing to offer, and
    // saying that beats listing parts which do not exist either.
    expect(await refusalOf({ object_type: 'TRANSPORT', part: 'urls' })).toMatch(
      /part=urls is not available[\s\S]*TRANSPORT[\s\S]*offers: nothing/,
    );
  });

  it('refuses metadata where there is none', async () => {
    expect(
      await refusalOf({
        object_type: 'UNIT_TEST',
        part: 'metadata',
        run_id: 'X',
      }),
    ).toMatch(/part=metadata is not available[\s\S]*UNIT_TEST/);
  });

  it('never silently answers a different part', async () => {
    expect(
      await refusalOf({ object_type: 'RUNTIME_DUMP', part: 'urls' }),
    ).toMatch(/not available/);
  });
});
