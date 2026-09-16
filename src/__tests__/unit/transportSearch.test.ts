import { handleListTransports } from '../../handlers/transport/readonly/handleListTransports';
import { corpusBody } from '../../lib/adtCorpus';
import { parseStructure } from '../../lib/strategies/reading';
import {
  MAX_SEARCH_CONFIGURATIONS,
  parseSearchConfigurations,
} from '../../lib/strategies/transportSearch';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

/**
 * Which saved search a transport listing runs, and who resolves it.
 *
 * `AdtRequest.list()` resolves one itself when it is not given a `configUri`,
 * behind a `protected` member — so no strategy of ours reads that request's
 * answer, and on a system holding several saved searches it throws rather
 * than choose. This repository makes the call instead; these tests are what
 * that is worth.
 */

const CONFIGURATIONS = corpusBody(
  'read-transport-search-configurations--01-searchconfiguration-configurations',
);
const LIST = corpusBody(
  'read-transport-list-structure--01-cts-transportrequests',
);

const REAL_URI =
  '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations/22D2111643541FE1A5AA03DC2D3DE702';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

/** A connection that answers the configurations endpoint with `document`. */
function connectionAnswering(document: string) {
  return {
    makeAdtRequest: async ({ url }: { url: string }) =>
      url.includes('searchconfiguration')
        ? { status: 200, data: document }
        : { status: 200, data: '' },
  } as any;
}

function listingClient(): any {
  return fakeClientOf({
    list: async () => okResponse(reading(parseStructure(LIST), LIST)),
  });
}

describe('parseSearchConfigurations, against the captured document', () => {
  it('reads the configuration and the href that addresses it', () => {
    const configurations = parseSearchConfigurations(
      parseStructure(CONFIGURATIONS),
    );

    expect(configurations).toHaveLength(1);
    expect(configurations[0].uri).toBe(REAL_URI);
    // The document carries an etag on the same link, so it is kept.
    expect(configurations[0].etag).toBe('20260812134609');
    // The configuration's own attributes travel unrenamed.
    expect(configurations[0].attributes.client).toBe('100');
  });

  it('answers nothing for a document that is not one, rather than throwing', () => {
    expect(parseSearchConfigurations(parseStructure('<other/>'))).toEqual([]);
    expect(parseSearchConfigurations(parseStructure(''))).toEqual([]);
    expect(parseSearchConfigurations(undefined)).toEqual([]);
  });

  it('skips a configuration it cannot address', () => {
    // Constructed, not captured: the real document's own shape with the
    // `atom:link` removed. A configuration with no href is one no `list()`
    // call could name, so it is not offered as a choice.
    const withoutLink =
      '<?xml version="1.0" encoding="utf-8"?><configurations:configurations xmlns:configurations="http://www.sap.com/adt/configurations"><configuration:configuration client="100" xmlns:configuration="http://www.sap.com/adt/configuration"/></configurations:configurations>';

    expect(parseSearchConfigurations(parseStructure(withoutLink))).toEqual([]);
  });
});

describe('ListTransports resolves the saved search itself', () => {
  it('has no saved search to run, and says which endpoint answered none', async () => {
    fakeClient = listingClient();
    const empty =
      '<?xml version="1.0" encoding="utf-8"?><configurations:configurations xmlns:configurations="http://www.sap.com/adt/configurations"/>';

    const result: any = await handleListTransports(
      { connection: connectionAnswering(empty), logger: undefined } as any,
      {},
    );

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toContain(
      '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations',
    );
  });

  it('searches every saved search when there are several, and names them', async () => {
    // Constructed from the captured document by repeating its one entry under
    // a second href — no system reachable here holds two, which is exactly
    // why the shipped resolver throws on this case and why it is worth
    // pinning what we do instead.
    const second = REAL_URI.replace(/.$/, '9');
    const two = CONFIGURATIONS.replace(
      '</configurations:configurations>',
      `<configuration:configuration client="100" xmlns:configuration="http://www.sap.com/adt/configuration"><atom:link href="${second}" xmlns:atom="http://www.w3.org/2005/Atom"/></configuration:configuration></configurations:configurations>`,
    );

    const asked: unknown[] = [];
    fakeClient = fakeClientOf({
      list: async (options: unknown) => {
        asked.push(options);
        return okResponse(reading(parseStructure(LIST), LIST));
      },
    });

    const result: any = await handleListTransports(
      { connection: connectionAnswering(two), logger: undefined } as any,
      {},
    );

    expect(result.isError).toBe(false);
    expect(asked).toEqual([{ configUri: REAL_URI }, { configUri: second }]);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.searched_configurations).toEqual([REAL_URI, second]);
    // Both searches answered the same document, and the same request is not
    // two requests: the merge collapses by request number.
    expect(payload.count).toBe(1);
  });

  it('stops at the cap and says so, rather than turning one call into many', async () => {
    const entries = Array.from(
      { length: MAX_SEARCH_CONFIGURATIONS + 2 },
      (_v, i) =>
        `<configuration:configuration xmlns:configuration="http://www.sap.com/adt/configuration"><atom:link href="${REAL_URI}/${i}" xmlns:atom="http://www.w3.org/2005/Atom"/></configuration:configuration>`,
    ).join('');
    const many = `<?xml version="1.0" encoding="utf-8"?><configurations:configurations xmlns:configurations="http://www.sap.com/adt/configurations">${entries}</configurations:configurations>`;

    let calls = 0;
    fakeClient = fakeClientOf({
      list: async () => {
        calls += 1;
        return okResponse(reading(parseStructure(LIST), LIST));
      },
    });

    const result: any = await handleListTransports(
      { connection: connectionAnswering(many), logger: undefined } as any,
      {},
    );

    expect(calls).toBe(MAX_SEARCH_CONFIGURATIONS);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.configurations_capped).toBe(MAX_SEARCH_CONFIGURATIONS);
  });

  it("hands back a refused search's own answer, untouched", async () => {
    fakeClient = fakeClientOf({
      list: async () => ({
        ok: false,
        getError: () => ({
          message: 'Search configuration no longer exists',
          origin: 'refusal',
        }),
        getResult: () => {
          throw new Error('not a success');
        },
      }),
    });

    const result: any = await handleListTransports(
      {
        connection: connectionAnswering(CONFIGURATIONS),
        logger: undefined,
      } as any,
      {},
    );

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
    expect(payload.message).toBe('Search configuration no longer exists');
  });
});
