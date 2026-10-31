/**
 * The case of a type value decides what it is (#329, S9 D2; the owner's
 * rule): a value in lower case is a friendly name, a value in upper case a
 * code, a main type or a search name. So `view` is the CDS view (`DDLS/DF`)
 * and `VIEW` the dictionary view — the search name `VIEW`, whose list item
 * is `VIEW/DV` — where it was read as `view` and answered as a DDL source.
 * A value in mixed case (`View`) and an upper-case value that is no word of
 * the tables (`CLASS`, `DBVIEW`) are read as before, as the friendly name.
 *
 * Each case runs the tool's own handler over a recording connection
 * declared the variant — real adt-clients code, no SAP.
 */
import {
  ADT_SEARCH_TYPES_CLOUD,
  ADT_SEARCH_TYPES_ONPREM,
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  ADT_UTILITY_CODES_CLOUD,
  ADT_UTILITY_CODES_ONPREM,
  type AdtApiTable,
} from '@mcp-abap-adt/interfaces-adt';
import { handleHandlerActivate } from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleHandlerSearch } from '../../../../compact-readonly-entries/src/handlers/handleHandlerSearch';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleActivateObject } from '../../../handlers/common/low/handleActivateObject';
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleGetNodeStructure } from '../../../handlers/system/low/handleGetNodeStructure';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  type ProjectionVariant,
  TYPE_NAME_LIST,
  TYPE_NAMES,
} from '../../../lib/adtProjections';
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

/** GetWhereUsed's single form. */
const whereUsedOne: Send = (context, value) =>
  handleGetWhereUsed(context, { object_type: value, object_name: 'ZV' });

/** The arguments that take a code, a main type or a friendly name, and `VIEW/DV`. */
const CODE_ARGUMENTS: readonly (readonly [string, Send])[] = [
  ['GetWhereUsed.object_type', whereUsedOne],
  [
    'GetWhereUsed.objects[].object_type',
    (context, value) =>
      handleGetWhereUsed(context, {
        objects: [
          { object_name: 'ZV', object_type: value },
          { object_name: 'ZW', object_type: value },
        ],
      }),
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
    'ActivateObjectLow.objects[].type',
    (context, value) =>
      handleActivateObject(context, { objects: [{ name: 'ZV', type: value }] }),
  ],
  [
    'HandlerActivate.objects[].type',
    (context, value) =>
      handleHandlerActivate(context, {
        objects: [{ name: 'ZV', type: value }],
      }),
  ],
  [
    'HandlerActivate.object_adt_type',
    (context, value) =>
      handleHandlerActivate(context, {
        object_name: 'ZV',
        object_adt_type: value,
      }),
  ],
];

/** The arguments that take the table's codes alone, which hold no `VIEW/DV`. */
const TABLE_ARGUMENTS: readonly (readonly [string, Send])[] = [
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

/** The `objectType` a search sent, through SearchObject or HandlerSearch. */
async function searched(
  tool: 'SearchObject' | 'HandlerSearch',
  variant: ProjectionVariant,
  value: string,
) {
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  if (tool === 'SearchObject') {
    await handleSearchObject(
      { connection },
      { object_name: 'Z*', object_type: value },
    );
  } else {
    await handleHandlerSearch(
      { connection },
      { query: 'Z*', object_type: value },
    );
  }
  expect(connection.requests).toHaveLength(1);
  const [request] = connection.requests;
  if (request === undefined) throw new Error('no request was sent');
  return new URL(request.url, 'https://system.invalid').searchParams.get(
    'objectType',
  );
}

/**
 * The tables' words, every one in upper case: the codes and main types of
 * the API tables, the utility codes, the search names of both lists.
 */
const API_TABLES: readonly AdtApiTable<string>[] = [
  ADT_TYPES_ONPREM,
  ADT_TYPES_CLOUD,
];

const TABLE_WORDS: ReadonlySet<string> = new Set([
  ...API_TABLES.flatMap((table) =>
    Object.values(table).flatMap((entry) =>
      entry === undefined
        ? []
        : Object.entries(entry.codes).flatMap(([code, facts]) => [
            code,
            facts.main,
          ]),
    ),
  ),
  ...Object.keys(ADT_UTILITY_CODES_ONPREM),
  ...Object.keys(ADT_UTILITY_CODES_CLOUD),
  ...Object.keys(ADT_SEARCH_TYPES_ONPREM),
  ...Object.keys(ADT_SEARCH_TYPES_CLOUD),
]);

describe('a lower-case value is a friendly name, an upper-case one a code, main type or search name', () => {
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

  it('the friendly names whose upper case is a word of the tables: view, func, stru', () => {
    expect(
      TYPE_NAME_LIST.filter((name) => TABLE_WORDS.has(name.toUpperCase())),
    ).toEqual(['view', 'func', 'stru']);
  });

  const codeCases = VARIANTS.flatMap((variant) =>
    CODE_ARGUMENTS.map(
      ([argument, send]) => [argument, variant, send] as const,
    ),
  );

  it.each(codeCases)(
    '%s on %s: VIEW sends exactly what VIEW/DV sends, under /ddic/views',
    async (_argument, variant, send) => {
      const byCode = await run(send, variant, 'VIEW/DV');
      const byUpper = await run(send, variant, 'VIEW');
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect(decodeURIComponent(byCode.requests.join('\n'))).toContain(
        '/sap/bc/adt/ddic/views/',
      );
      expect(byUpper.requests).toEqual(byCode.requests);
    },
  );

  it.each(codeCases)(
    '%s on %s: view and View send exactly what DDLS/DF sends',
    async (_argument, variant, send) => {
      const byCode = await run(send, variant, 'DDLS/DF');
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect(decodeURIComponent(byCode.requests.join('\n'))).not.toContain(
        '/sap/bc/adt/ddic/views/',
      );
      expect((await run(send, variant, 'view')).requests).toEqual(
        byCode.requests,
      );
      expect((await run(send, variant, 'View')).requests).toEqual(
        byCode.requests,
      );
    },
  );

  // `func` and `stru` collide too; their upper case is a search name that
  // lists the code the name stands for, so the reading does not change.
  // (Where-used names a function module GROUP|MODULE, which these ZV
  // objects are not; it is left to the activation tools here.)
  it.each(codeCases.filter(([argument]) => argument.startsWith('Activate')))(
    '%s on %s: STRU and FUNC are read as stru and func',
    async (_argument, variant, send) => {
      const byName = await run(send, variant, 'stru');
      const byUpper = await run(send, variant, 'STRU');
      expect(byName.requests.length).toBeGreaterThan(0);
      expect(byUpper.requests).toEqual(byName.requests);
      // A function module names its group; without one both are refused
      // naming the same code, and nothing is sent.
      const funcName = await run(send, variant, 'func');
      const funcUpper = await run(send, variant, 'FUNC');
      expect(funcUpper.requests).toEqual([]);
      expect(funcUpper.answered).toContain(
        'objects[].parentName is required for ZV (FUGR/FF)',
      );
      expect(funcUpper.answered).toEqual(funcName.answered);
    },
  );

  it.each(VARIANTS)(
    'GetWhereUsed.object_type on %s: STRU sends exactly what stru sends',
    async (variant) => {
      const byName = await run(whereUsedOne, variant, 'stru');
      const byUpper = await run(whereUsedOne, variant, 'STRU');
      expect(byName.requests.length).toBeGreaterThan(0);
      expect(byUpper.requests).toEqual(byName.requests);
    },
  );

  const tableCases = VARIANTS.flatMap((variant) =>
    TABLE_ARGUMENTS.map(
      ([argument, send]) => [argument, variant, send] as const,
    ),
  );

  it.each(tableCases)(
    '%s on %s: VIEW is the dictionary view, which it takes no code of: refused, nothing sent',
    async (_argument, variant, send) => {
      const { requests, answered } = await run(send, variant, 'VIEW');
      expect(requests).toEqual([]);
      expect(answered).toContain('"VIEW" is not one of: CLAS/OC');
    },
  );

  it.each(tableCases)(
    '%s on %s: view and View are the CDS view, DDLS/DF',
    async (_argument, variant, send) => {
      const byCode = await run(send, variant, 'DDLS/DF');
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect((await run(send, variant, 'view')).requests).toEqual(
        byCode.requests,
      );
      expect((await run(send, variant, 'View')).requests).toEqual(
        byCode.requests,
      );
    },
  );

  const searchCases = VARIANTS.flatMap((variant) =>
    (['SearchObject', 'HandlerSearch'] as const).map(
      (tool) => [tool, variant] as const,
    ),
  );

  it.each(searchCases)(
    '%s on %s: VIEW is the search name VIEW; view and View are DDLS',
    async (tool, variant) => {
      expect(await searched(tool, variant, 'VIEW')).toBe('VIEW');
      expect(await searched(tool, variant, 'view')).toBe('DDLS');
      expect(await searched(tool, variant, 'View')).toBe('DDLS');
      // A friendly name in upper case that is no word of the tables stays one.
      expect(await searched(tool, variant, 'CLASS')).toBe('CLAS');
      expect(await searched(tool, variant, 'DBVIEW')).toBe('VIEW');
      expect(await searched(tool, variant, 'STRU')).toBe('STRU');
      expect(await searched(tool, variant, 'FUNC')).toBe('FUNC');
    },
  );
});
