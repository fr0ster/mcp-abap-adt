/**
 * SearchObject's `object_type` (and HandlerSearch's, which hands it on): the
 * declared variant's search names (#329, spec 3.6) — a name of the release's
 * object types list (`ADT_SEARCH_TYPES_ONPREM`, `ADT_SEARCH_TYPES_CLOUD`), or
 * an ADT type code, read as the name the search reads it as: the list item
 * whose `type` it is (`TABL/DS` → `STRU`; `PROG/P`, the type of `PROG` and
 * `REPO`, → its main type `PROG`), else the main type its entry in the type
 * tables states (`ENHO/XHH` → `ENHO`). Anything else is refused naming that
 * it takes the search names, and nothing is sent.
 *
 * Each case runs the handler over a recording connection declared the
 * variant — real adt-clients code, no SAP — and reads the `objectType` of
 * the one quickSearch on the wire.
 */
import { handleHandlerSearch } from '../../../compact-readonly-entries/src/handlers/handleHandlerSearch';
import { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject';
import { handleDescribeByList } from '../../handlers/system/readonly/handleDescribeByList';
import type { ProjectionVariant } from '../../lib/adtProjections';
import { createBatchAvailability } from '../../lib/batch/availability';
import { declareSystemKind } from '../../lib/systemKind';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** A batch the system does not serve: DescribeByList searches one by one. */
function oneByOne() {
  const notServed = createBatchAvailability();
  notServed.noteOuterStatus(404);
  return notServed;
}

/** The `objectType` of the one search on the wire; `null` for none. */
function sentObjectType(requests: readonly RecordedRequest[]): string | null {
  expect(requests).toHaveLength(1);
  const [request] = requests;
  if (request === undefined) throw new Error('no request was sent');
  return new URL(request.url, 'https://system.invalid').searchParams.get(
    'objectType',
  );
}

/** The text of a tool's answer. */
function textOf(result: { content: readonly { text?: string }[] }): string {
  return result.content.map((part) => part.text ?? '').join('\n');
}

async function search(
  variant: ProjectionVariant,
  objectType: string | undefined,
) {
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  const result = await handleSearchObject(
    { connection },
    {
      object_name: 'Z*',
      ...(objectType === undefined ? {} : { object_type: objectType }),
    },
  );
  return { result, requests: connection.requests };
}

/** The refusal of a filter value that names no search name. */
const refusal = (value: string) =>
  `object_type "${value}" is neither a name of this system's object types list nor an ADT type code or a name standing for one: it takes the search names (e.g. CLAS, DEVC, STRU), an ADT type code (e.g. TABL/DS) or a name standing for a code (e.g. class, structure); nothing was sent`;

/** A name only the other variant's list holds, per variant. */
const OTHERS_ONLY: { readonly [V in ProjectionVariant]: string } = {
  onprem: 'TXPA',
  cloud: 'BCCH',
};

/** A name only this variant's list holds. */
const OWN_ONLY: { readonly [V in ProjectionVariant]: string } = {
  onprem: 'BCCH',
  cloud: 'TXPA',
};

describe.each(VARIANTS)('SearchObject.object_type on %s', (variant) => {
  it.each([
    ['STRU', 'STRU'],
    ['stru', 'STRU'],
    ['TABL', 'TABL'],
    ['DEVC', 'DEVC'],
    ['FUNC', 'FUNC'],
    ['abap_test_cockpit', 'ABAP_TEST_COCKPIT'],
  ])('a search name, %s, is sent as %s', async (value, wire) => {
    const { result, requests } = await search(variant, value);
    expect(result.isError).toBe(false);
    expect(sentObjectType(requests)).toBe(wire);
  });

  it("a name only this variant's list holds is sent", async () => {
    const own = OWN_ONLY[variant];
    const { requests } = await search(variant, own);
    expect(sentObjectType(requests)).toBe(own);
  });

  it.each([
    // The item whose `type` the code is.
    ['CLAS/OC', 'CLAS'],
    ['DEVC/K', 'DEVC'],
    ['TABL/DS', 'STRU'],
    ['tabl/dt', 'DTAB'],
    ['FUGR/FF', 'FUNC'],
    ['PROG/I', 'INCL'],
    // Two items list it (`PROG`, `REPO`): the one that is its main type.
    ['PROG/P', 'PROG'],
    // No item lists it: the main type its entry states.
    ['ENHO/XHH', 'ENHO'],
    ['ENHO/XHB', 'ENHO'],
    ['ENHS/XSB', 'ENHS'],
    ['MSAG/NN', 'MSAG'],
  ])('a code, %s, stands for the name %s', async (value, wire) => {
    const { requests } = await search(variant, value);
    expect(sentObjectType(requests)).toBe(wire);
  });

  it.each([
    // The code of the name is the item's type.
    ['class', 'CLAS'],
    ['structure', 'STRU'],
    ['table', 'DTAB'],
    ['FUNCTION', 'FUNC'],
    ['function_module', 'FUNC'],
    ['functiongroup', 'FUGR'],
    ['include', 'INCL'],
    ['package', 'DEVC'],
    // Two items list the code (`PROG`, `REPO`): the one that is its main type.
    ['program', 'PROG'],
    // A name is read as its code before the list: `view` is a CDS view
    // (`DDLS/DF`), in lower or mixed case; in upper case `VIEW` is the
    // search name of the dictionary views (`VIEW/DV`; caseRule.test.ts).
    ['view', 'DDLS'],
    ['View', 'DDLS'],
    ['VIEW/DV', 'VIEW'],
  ])('a friendly name, %s, reaches the wire as %s', async (value, wire) => {
    const { requests } = await search(variant, value);
    expect(sentObjectType(requests)).toBe(wire);
  });

  it.each(['NOPE', 'NOPE/XX', 'classes', OTHERS_ONLY[variant]])(
    '%s names no search name: refused, nothing sent',
    async (value) => {
      const { result, requests } = await search(variant, value);
      expect(requests).toEqual([]);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(refusal(value));
    },
  );

  it('no filter sends none', async () => {
    const { requests } = await search(variant, undefined);
    expect(sentObjectType(requests)).toBeNull();
  });

  it('HandlerSearch hands its object_type on to the same boundary', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    await handleHandlerSearch(
      { connection },
      {
        query: 'Z*',
        object_type: 'TABL/DS',
      },
    );
    expect(sentObjectType(connection.requests)).toBe('STRU');
    const refusedConnection = recordingConnection();
    declareSystemKind(refusedConnection, variant);
    const refused = await handleHandlerSearch(
      { connection: refusedConnection },
      { query: 'Z*', object_type: 'NOPE' },
    );
    expect(refusedConnection.requests).toEqual([]);
    expect(textOf(refused)).toContain(refusal('NOPE'));
  });

  it('DescribeByList searches an object whose type is no search name without one', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    await handleDescribeByList(
      { connection, batchAvailability: oneByOne() },
      { objects: [{ name: 'ZT', type: 'NOPE' }] },
    );
    expect(sentObjectType(connection.requests)).toBeNull();
  });

  it('DescribeByList sends a code as the search name it stands for', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    await handleDescribeByList(
      { connection, batchAvailability: oneByOne() },
      { objects: [{ name: 'ZT', type: 'TABL/DT' }] },
    );
    const types = connection.requests.map((request) =>
      new URL(request.url, 'https://system.invalid').searchParams.get(
        'objectType',
      ),
    );
    expect(types).toEqual(['DTAB']);
  });
});
