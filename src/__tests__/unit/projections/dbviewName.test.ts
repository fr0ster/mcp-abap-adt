/**
 * The friendly name `dbview` (#329): a dictionary view, `VIEW/DV` — `view`
 * stays the CDS view (`DDLS/DF`). Where an argument's projection takes
 * `VIEW/DV` (where-used, a group activation; on premise and on ABAP cloud,
 * whose utility tables both list it), `dbview` sends exactly what `VIEW/DV`
 * sends; the search sends it as the search name `VIEW`; where the projection
 * does not take `VIEW/DV` (the structure tools: no API table holds it), it
 * is refused naming the list and nothing is sent.
 *
 * Each case runs the tool's own handler over a recording connection declared
 * the variant — real adt-clients code, no SAP.
 */
import { handleHandlerActivate } from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleGetNodeStructure } from '../../../handlers/system/low/handleGetNodeStructure';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import {
  type RecordedRequest,
  recordingConnection,
} from '../../helpers/recordingConnection';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

type Send = (context: HandlerContext, value: string) => Promise<unknown>;

/** The arguments whose projection takes `VIEW/DV`. */
const SERVED: readonly (readonly [string, Send])[] = [
  [
    'GetWhereUsed.object_type',
    (context, value) =>
      handleGetWhereUsed(context, { object_type: value, object_name: 'ZV' }),
  ],
  [
    'ActivateObjects.objects[].type',
    (context, value) =>
      handleActivateObjects(context, {
        objects: [
          { name: 'ZV', type: value },
          { name: 'ZW', type: value },
        ],
      }),
  ],
  [
    'HandlerActivate.objects[].type',
    (context, value) =>
      handleHandlerActivate(context, {
        objects: [{ name: 'ZV', type: value }],
      }),
  ],
];

/** The arguments whose projection does not take `VIEW/DV`. */
const NOT_SERVED: readonly (readonly [string, Send])[] = [
  [
    'GetObjectStructure.object_type',
    (context, value) =>
      handleGetObjectStructure(context, {
        object_type: value,
        object_name: 'ZV',
      }),
  ],
  [
    'GetNodeStructure.parent_type',
    (context, value) =>
      handleGetNodeStructure(context, {
        parent_type: value,
        parent_name: 'ZV',
      }),
  ],
];

/** What a handler answered, thrown or returned, as text. */
function textOf(answered: unknown): string {
  return JSON.stringify(answered).replaceAll('\\"', '"');
}

async function run(send: Send, variant: ProjectionVariant, value: string) {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  const answered = await send({ connection }, value).catch(
    (thrown: unknown) => ({ thrown: String(thrown) }),
  );
  return {
    requests: connection.requests.map((request: RecordedRequest) =>
      JSON.stringify(request).replaceAll(/batch_[0-9a-f-]+/g, 'batch_X'),
    ),
    answered: textOf(answered),
  };
}

describe('dbview is the dictionary view, VIEW/DV', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });

  afterEach(() => {
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  const served = VARIANTS.flatMap((variant) =>
    SERVED.map(([tool, send]) => [tool, variant, send] as const),
  );

  it.each(served)(
    '%s on %s: dbview sends exactly what VIEW/DV sends, under /ddic/views',
    async (_tool, variant, send) => {
      const byCode = await run(send, variant, 'VIEW/DV');
      const byName = await run(send, variant, 'dbview');
      const byUpper = await run(send, variant, 'DBVIEW');
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect(decodeURIComponent(byCode.requests.join('\n'))).toContain(
        '/sap/bc/adt/ddic/views/',
      );
      expect(byName.requests).toEqual(byCode.requests);
      expect(byUpper.requests).toEqual(byCode.requests);
    },
  );

  it.each(served)(
    '%s on %s: view stays the CDS view, DDLS/DF',
    async (_tool, variant, send) => {
      const byView = await run(send, variant, 'view');
      const byDdl = await run(send, variant, 'DDLS/DF');
      expect(byView.requests.length).toBeGreaterThan(0);
      expect(byView.requests).toEqual(byDdl.requests);
    },
  );

  const notServed = VARIANTS.flatMap((variant) =>
    NOT_SERVED.map(([tool, send]) => [tool, variant, send] as const),
  );

  it.each(notServed)(
    '%s on %s: dbview is refused naming the list, nothing sent',
    async (_tool, variant, send) => {
      const { requests, answered } = await run(send, variant, 'dbview');
      expect(requests).toEqual([]);
      expect(answered).toContain('"dbview" is not one of: CLAS/OC');
    },
  );

  it.each(VARIANTS)(
    'SearchObject on %s: dbview is sent as the search name VIEW, view as DDLS',
    async (variant) => {
      const objectTypeOf = async (value: string) => {
        const connection = recordingConnection();
        declareSystemKind(connection, variant);
        await handleSearchObject(
          { connection },
          { object_name: 'Z*', object_type: value },
        );
        expect(connection.requests).toHaveLength(1);
        const [request] = connection.requests;
        if (request === undefined) throw new Error('no request was sent');
        return new URL(request.url, 'https://system.invalid').searchParams.get(
          'objectType',
        );
      };
      expect(await objectTypeOf('dbview')).toBe('VIEW');
      expect(await objectTypeOf('view')).toBe('DDLS');
    },
  );
});
