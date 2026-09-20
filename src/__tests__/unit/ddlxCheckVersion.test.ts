import { handleCheckMetadataExtension as high } from '../../handlers/ddlx/high/handleCheckMetadataExtension';
import { handleCheckMetadataExtension as low } from '../../handlers/ddlx/low/handleCheckMetadataExtension';
import { corpusBody } from '../../lib/adtCorpus';
import { parseStructure } from '../../lib/strategies/reading';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

/**
 * Which version a DDLX check asks for, and why the tool has to say.
 *
 * The DDLX checkruns endpoint does not fall back to the version that exists,
 * unlike the DDLS one. Both documents below are captures from the same
 * extension, in the same state, differing only in the version asked for —
 * which is the whole point: an activated extension answers `processed` for
 * `active` and `notProcessed` for `inactive`, so the shipped default (which
 * is `inactive`) answered nothing useful for every activated extension. That
 * is eseuve's report in #178; the branch there could not be merged, because
 * it dropped the `analyse` this repository injects, so the fix is rebuilt
 * here on the migrated code.
 */

const PROCESSED = corpusBody('check-ddlx-active-version--01-checkrun');
const NOT_PROCESSED = corpusBody('check-ddlx-inactive-version--01-checkrun');

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };
const payload = (result: any) => JSON.parse(result.content[0].text);

/** A client that records the version asked for and answers the capture. */
function clientAnswering(document: string, asked: string[]) {
  return fakeClientOf({
    check: async (_config: unknown, version: unknown) => {
      asked.push(String(version));
      return okResponse(reading(parseStructure(document), document, 200));
    },
  });
}

describe('CheckMetadataExtensionLow names the version it checks', () => {
  it('asks for the active version by default', async () => {
    const asked: string[] = [];
    fakeClient = clientAnswering(PROCESSED, asked);

    const result: any = await low(context as any, {
      name: 'zmcp_bld_ddlx_chk',
    });

    expect(asked).toEqual(['active']);
    expect(result.isError).toBe(false);
    // The capture: an activated extension, asked for the version it has.
    expect(payload(result)).toMatchObject({
      ran: true,
      status_text: 'Object ZMCP_BLD_DDLX_CHK has been checked',
    });
  });

  it('asks for the inactive version when told to', async () => {
    const asked: string[] = [];
    fakeClient = clientAnswering(NOT_PROCESSED, asked);

    const result: any = await low(context as any, {
      name: 'ZMCP_BLD_DDLX_CHK',
      version: 'inactive',
    });

    expect(asked).toEqual(['inactive']);
    // **Not a failure.** A `notProcessed` is a 200 with a report in it, and
    // `analyseException` refuses on an exception or a non-2xx and nothing
    // else. The caller is told the check did not run, and why — which is what
    // `terseCheck`'s `ran` is for.
    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      ran: false,
      status_text:
        'Error while reading the object ZMCP_BLD_DDLX_CHK from the database',
    });
  });

  it('treats anything else as active rather than passing it on', async () => {
    const asked: string[] = [];
    fakeClient = clientAnswering(PROCESSED, asked);
    await low(context as any, { name: 'ZX', version: 'ACTIVE' as never });
    await low(context as any, { name: 'ZX', version: 'nonsense' as never });
    expect(asked).toEqual(['active', 'active']);
  });
});

describe('CheckMetadataExtension forwards the version through the wrapper', () => {
  it('passes it to the low-tier sibling', async () => {
    const asked: string[] = [];
    fakeClient = clientAnswering(NOT_PROCESSED, asked);

    const result: any = await high(context as any, {
      name: 'ZMCP_BLD_DDLX_CHK',
      version: 'inactive',
    });

    expect(asked).toEqual(['inactive']);
    expect(result.isError).toBe(false);
  });

  it('defaults to active like the tier below it', async () => {
    const asked: string[] = [];
    fakeClient = clientAnswering(PROCESSED, asked);
    await high(context as any, { name: 'ZMCP_BLD_DDLX_CHK' });
    expect(asked).toEqual(['active']);
  });
});
