/**
 * A group activation goes where the system's discovery says it can
 * (fr0ster/mcp-abap-adt#351): `/sap/bc/adt/activation/runs` when the
 * discovery lists it, the synchronous `/sap/bc/adt/activation`
 * (`activateObjects`) when it does not, and nothing at all when the discovery
 * cannot be read. Nothing is tried to find out: a `404` from `/runs` is that
 * call's answer, not a reason to post elsewhere.
 *
 * Each case replays recorded answers over a connection that answers by
 * request — real adt-clients code, no SAP: the discovery of S/4HANA 2025,
 * of SAP_BASIS 7.40 and the 751 partial one (`tests/fixtures/adt/`).
 */
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';

const RUN_ID = 'RUN0001';
const ACTIVATED =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>';

interface Answer {
  status: number;
  data?: string;
  headers?: Record<string, string>;
}

/** A refusal the way a transport throws a non-2xx: an error carrying it. */
function refusal(answer: Answer) {
  return Object.assign(
    new Error(`Request failed with status code ${answer.status}`),
    {
      response: {
        status: answer.status,
        statusText: '',
        headers: answer.headers ?? {},
        data: answer.data ?? '',
      },
    },
  );
}

/** A connection answering by request, recording `METHOD path` of each. */
function answering(route: (options: IAbapRequestOptions) => Answer) {
  const requests: string[] = [];
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest<T = unknown, D = unknown>(
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse<T, D>> {
      requests.push(`${options.method} ${options.url.split('?')[0]}`);
      const answer = route(options);
      if (answer.status >= 400) throw refusal(answer);
      // A recorded body is text; `T` is the caller's view of it, which a
      // replay does not narrow — the assertion every fake connection makes.
      return {
        data: (answer.data ?? '') as T,
        status: answer.status,
        statusText: 'OK',
        headers: answer.headers ?? {},
      };
    },
  };
  return { connection, requests };
}

/** What the system answers, the discovery given (and, optionally, what `/activation` answers). */
function system(
  discovery: Answer,
  runs: Answer = { status: 202 },
  activation: Answer = { status: 200, data: ACTIVATED },
) {
  return (options: IAbapRequestOptions): Answer => {
    const url = options.url;
    if (url.startsWith('/sap/bc/adt/discovery')) return discovery;
    if (url.startsWith('/sap/bc/adt/activation/runs?'))
      return runs.status === 202
        ? {
            status: 202,
            headers: { location: `/sap/bc/adt/activation/runs/${RUN_ID}` },
          }
        : runs;
    if (url.startsWith(`/sap/bc/adt/activation/runs/${RUN_ID}`))
      return {
        status: 200,
        data: `<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>`,
      };
    if (url.startsWith(`/sap/bc/adt/activation/results/${RUN_ID}`))
      return { status: 200, data: ACTIVATED };
    if (url.startsWith('/sap/bc/adt/activation?')) return activation;
    return { status: 200 };
  };
}

const discoveryOf = (name: string): Answer => ({
  status: 200,
  data: corpusBody(name),
});

const OBJECTS = [
  { name: 'ZA', type: 'TABL/DS' },
  { name: 'ZB', type: 'TABL/DS' },
];

async function activateGroup(route: (o: IAbapRequestOptions) => Answer) {
  const { connection, requests } = answering(route);
  declareSystemKind(connection, 'onprem');
  const context: HandlerContext = { connection, logger: undefined };
  const result = await handleActivateObjects(context, { objects: OBJECTS });
  return { result, requests };
}

/** The JSON payload a tool answered, and whether it is an error. */
function read(result: object): {
  isError: boolean;
  payload: Record<string, unknown>;
} {
  const isError = 'isError' in result && result.isError === true;
  const content = 'content' in result ? result.content : undefined;
  const first = Array.isArray(content) ? content[0] : undefined;
  const text =
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
      ? first.text
      : '{}';
  return { isError, payload: JSON.parse(text) };
}

beforeAll(() => {
  setSystemContext({ masterSystem: 'SID', responsible: 'SAPUSER01' });
});
afterAll(() => resetSystemContextCache());

describe('the group endpoint, from discovery', () => {
  it('S/4HANA 2025 lists /activation/runs: the run sequence', async () => {
    const { result, requests } = await activateGroup(
      system(discoveryOf('system-description-s4-2025--03-discovery')),
    );
    expect(read(result).isError).toBe(false);
    expect(requests).toEqual([
      'GET /sap/bc/adt/discovery',
      'POST /sap/bc/adt/activation/runs',
      `GET /sap/bc/adt/activation/runs/${RUN_ID}`,
      `GET /sap/bc/adt/activation/results/${RUN_ID}`,
    ]);
  });

  it.each([
    ['SAP_BASIS 7.40', 'system-description-basis-740--03-discovery'],
    ['751 (partial)', 'system-description-751-partial--01-discovery'],
  ])(
    '%s lists no /activation/runs: one POST /activation',
    async (_what, name) => {
      const { result, requests } = await activateGroup(
        system(discoveryOf(name)),
      );
      expect(read(result).isError).toBe(false);
      expect(read(result).payload).toMatchObject({ activated: true });
      expect(requests).toEqual([
        'GET /sap/bc/adt/discovery',
        'POST /sap/bc/adt/activation',
      ]);
    },
  );

  it('a discovery that fails: an error at step discovery, no activation request', async () => {
    const { result, requests } = await activateGroup(
      system({ status: 500, data: 'Internal Server Error' }),
    );
    const { isError, payload } = read(result);
    expect(isError).toBe(true);
    expect(payload.step).toBe('discovery');
    expect(requests).toEqual(['GET /sap/bc/adt/discovery']);
  });

  it('a discovery that lists nothing: an error at step discovery, no activation request', async () => {
    const { result, requests } = await activateGroup(
      system({ status: 200, data: '<html><body>Logon</body></html>' }),
    );
    const { isError, payload } = read(result);
    expect(isError).toBe(true);
    expect(payload.step).toBe('discovery');
    expect(payload.message).toContain('could not be read');
    expect(requests).toEqual(['GET /sap/bc/adt/discovery']);
  });

  it('a 404 from /activation/runs is the answer: nothing is posted elsewhere', async () => {
    const { result, requests } = await activateGroup(
      system(discoveryOf('system-description-s4-2025--03-discovery'), {
        status: 404,
        data: corpusBody('activation-runs-absent-751--01-activation'),
      }),
    );
    expect(read(result).isError).toBe(true);
    expect(requests).toEqual([
      'GET /sap/bc/adt/discovery',
      'POST /sap/bc/adt/activation/runs',
    ]);
  });
});

/**
 * An empty `200` from `/activation` is an activation (fr0ster/mcp-abap-adt#351,
 * the owner's Q1 (a)), and it is answered as one at every detail and on both
 * paths — measured on E77 (SAP_BASIS 7.40, RFC): `ActivateObjects` on two
 * programs answered `projection_failed` though both had activated. The
 * answer replayed is the recorded `activation-sync-activated-751` (an empty
 * `200`, activated).
 */
describe('an empty 200 from /activation: activated, at every detail', () => {
  const EMPTY_200: Answer = {
    status: 200,
    data: corpusBody('activation-sync-activated-751--01-activation'),
  };
  const SEVEN_40 = discoveryOf('system-description-basis-740--03-discovery');

  async function activate(
    objects: ReadonlyArray<{ name: string; type: string }>,
    detail: 'terse' | 'full' | 'raw',
  ) {
    const { connection, requests } = answering(
      system(SEVEN_40, { status: 202 }, EMPTY_200),
    );
    declareSystemKind(connection, 'onprem');
    const context: HandlerContext = { connection, logger: undefined };
    const result = await handleActivateObject(context, {
      objects: [...objects],
      detail,
    });
    return { result, requests };
  }

  it('ActivateObjects, two programs (the group path, as on E77): activated', async () => {
    const { connection, requests } = answering(
      system(SEVEN_40, { status: 202 }, EMPTY_200),
    );
    declareSystemKind(connection, 'onprem');
    const result = await handleActivateObjects(
      { connection, logger: undefined },
      {
        objects: [
          { name: 'ZA', type: 'PROG/P' },
          { name: 'ZB', type: 'PROG/P' },
        ],
      },
    );
    expect(read(result)).toEqual({
      isError: false,
      payload: { activated: true },
    });
    expect(requests).toEqual([
      'GET /sap/bc/adt/discovery',
      'POST /sap/bc/adt/activation',
    ]);
  });

  it.each(['terse', 'full', 'raw'] as const)(
    'the group path at detail %s: a success',
    async (detail) => {
      const { result } = await activate(OBJECTS, detail);
      expect('isError' in result && result.isError === true).toBe(false);
      if (detail !== 'raw') {
        expect(read(result).payload).toEqual({ activated: true });
      }
    },
  );

  it.each(['terse', 'full', 'raw'] as const)(
    'the single-object path at detail %s: a success',
    async (detail) => {
      const { result, requests } = await activate(
        [{ name: 'ZP', type: 'PROG/P' }],
        detail,
      );
      expect(requests.at(-1)).toBe('POST /sap/bc/adt/activation');
      expect('isError' in result && result.isError === true).toBe(false);
      if (detail !== 'raw') {
        expect(read(result).payload).toEqual({ activated: true });
      }
    },
  );
});
