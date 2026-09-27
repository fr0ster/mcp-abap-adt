import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleListTransports } from '../../handlers/transport/readonly/handleListTransports';
import { corpusBody } from '../../lib/adtCorpus';
import { parseStructure } from '../../lib/strategies/reading';
import { MAX_SEARCH_CONFIGURATIONS } from '../../lib/strategies/transportSearch';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

/**
 * Which saved search a transport listing runs, and what happens when a system
 * holds more than one.
 *
 * The request is the client's again: `getRequest().searchConfigurations()`
 * arrived in adt-clients 19.1.0, and this handler asks for the configurations
 * rather than letting `list()` resolve one behind a `protected` member no
 * strategy of ours could reach. What is still this repository's to decide is
 * the part the client deliberately refuses to guess — several saved searches
 * — and that is what these cover.
 */

const LIST = corpusBody(
  'read-transport-list-structure--01-cts-transportrequests',
);

const REAL_URI =
  '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations/22D2111643541FE1A5AA03DC2D3DE702';

const configuration = (uri: string) => ({ uri, attributes: { client: '100' } });

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

/** A client whose saved searches are `uris`, and whose lists are the corpus. */
function clientWith(uris: string[], onList?: (options: unknown) => void) {
  return fakeClientOf({
    searchConfigurations: async () => okResponse(uris.map(configuration)),
    list: async (options: unknown) => {
      onList?.(options);
      return okResponse(reading(parseStructure(LIST), LIST));
    },
  });
}

describe('ListTransports asks for the saved search rather than assuming one', () => {
  it('passes the configUri it was given back to list()', async () => {
    const asked: unknown[] = [];
    fakeClient = clientWith([REAL_URI], (options) => asked.push(options));

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(false);
    expect(asked).toEqual([{ configUri: REAL_URI, analyse: analyseException }]);
  });

  it('has no saved search to run, and says which endpoint answered none', async () => {
    fakeClient = fakeClientOf({
      searchConfigurations: async () => okResponse([]),
    });

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toContain(
      '/sap/bc/adt/cts/transportrequests/searchconfiguration/configurations',
    );
  });

  it("forwards the configurations endpoint's own refusal", async () => {
    fakeClient = fakeClientOf({
      searchConfigurations: async () => ({
        ok: false,
        getError: () => ({
          message: 'Not acceptable',
          origin: 'refusal',
        }),
        getResult: () => {
          throw new Error('not a success');
        },
      }),
    });

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    // The endpoint's own account, not a sentence this handler composed about
    // a call it made on the caller's behalf.
    expect(payload.origin).toBe('refusal');
    expect(payload.message).toBe('Not acceptable');
  });

  it('searches every saved search when there are several, and names them', async () => {
    const second = `${REAL_URI}9`;
    const asked: unknown[] = [];
    fakeClient = clientWith([REAL_URI, second], (options) =>
      asked.push(options),
    );

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(false);
    expect(asked).toEqual([
      { configUri: REAL_URI, analyse: analyseException },
      { configUri: second, analyse: analyseException },
    ]);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.searched_configurations).toEqual([REAL_URI, second]);
    // Both searches answered the same document, and the same request is not
    // two requests: the merge collapses by request number.
    expect(payload.count).toBe(1);
  });

  it('does not hand an unowned request to whoever is asking', async () => {
    // `tm:owner` missing from the document: the parser answers `''`, and a
    // filter that treated that as "matches anybody" would report someone
    // else's — or nobody's — transport as the caller's own.
    const unowned =
      '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:workbench><tm:modifiable><tm:request tm:number="TRLK900999" tm:desc="no owner recorded" tm:type="K" tm:status="D"/></tm:modifiable></tm:workbench></tm:root>';

    fakeClient = fakeClientOf({
      searchConfigurations: async () => okResponse([configuration(REAL_URI)]),
      list: async () => okResponse(reading(parseStructure(unowned), unowned)),
    });

    const asked: any = await handleListTransports(context as any, {
      user: 'SAPUSER01',
    });
    expect(JSON.parse(asked.content[0].text).count).toBe(0);

    // Without a user to filter by there is nothing to attribute, so it shows.
    // `SAP_USERNAME` is cleared for this half: the handler falls back to it
    // when the caller names nobody, and an environment that happened to carry
    // one would turn this into a filtered call and pass for the wrong reason.
    const savedUser = process.env.SAP_USERNAME;
    process.env.SAP_USERNAME = '';
    try {
      fakeClient = fakeClientOf({
        searchConfigurations: async () => okResponse([configuration(REAL_URI)]),
        list: async () => okResponse(reading(parseStructure(unowned), unowned)),
      });
      const unfiltered: any = await handleListTransports(context as any, {});
      expect(JSON.parse(unfiltered.content[0].text).count).toBe(1);
    } finally {
      if (savedUser === undefined) {
        process.env.SAP_USERNAME = undefined;
        delete process.env.SAP_USERNAME;
      } else {
        process.env.SAP_USERNAME = savedUser;
      }
    }
  });

  it('stops at the cap and says so, rather than turning one call into many', async () => {
    let calls = 0;
    fakeClient = clientWith(
      Array.from(
        { length: MAX_SEARCH_CONFIGURATIONS + 2 },
        (_v, i) => `${REAL_URI}/${i}`,
      ),
      () => {
        calls += 1;
      },
    );

    const result: any = await handleListTransports(context as any, {});

    expect(calls).toBe(MAX_SEARCH_CONFIGURATIONS);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.configurations_capped).toBe(MAX_SEARCH_CONFIGURATIONS);
  });

  it("hands back a refused search's own answer, untouched", async () => {
    fakeClient = fakeClientOf({
      searchConfigurations: async () => okResponse([configuration(REAL_URI)]),
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

    const result: any = await handleListTransports(context as any, {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
    expect(payload.message).toBe('Search configuration no longer exists');
  });
});
