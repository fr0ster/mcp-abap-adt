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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
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
import { handleHandlerSystem } from '../../../../compact-readonly-entries/src/handlers/handleHandlerSystem';
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
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { setSystemContext } from '../../helpers/processSystemContext';
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
        objecttype: value,
        objectname: 'ZV',
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

/** The `objectType` a search sent, through SearchObject or HandlerSystem search_object. */
async function searched(
  tool: 'SearchObject' | 'HandlerSystem',
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
    await handleHandlerSystem(
      { connection },
      { action: 'search_object', object_name: 'Z*', object_type: value },
    );
  }
  assert.equal(connection.requests.length, 1);
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
    assert.deepStrictEqual(
      TYPE_NAME_LIST.filter((name) => TABLE_WORDS.has(name.toUpperCase())),
      ['view', 'func', 'stru'],
    );
  });

  const codeCases = VARIANTS.flatMap((variant) =>
    CODE_ARGUMENTS.map(
      ([argument, send]) => [argument, variant, send] as const,
    ),
  );

  for (const [_argument, variant, send] of codeCases) {
    it(
      format(
        '%s on %s: VIEW sends exactly what VIEW/DV sends, under /ddic/views',
        _argument,
        variant,
      ),
      async () => {
        const byCode = await run(send, variant, 'VIEW/DV');
        const byUpper = await run(send, variant, 'VIEW');
        assert.ok(byCode.requests.length > 0);
        assert.ok(
          decodeURIComponent(byCode.requests.join('\n')).includes(
            '/sap/bc/adt/ddic/views/',
          ),
        );
        assert.deepStrictEqual(byUpper.requests, byCode.requests);
      },
    );
  }

  for (const [_argument, variant, send] of codeCases) {
    it(
      format(
        '%s on %s: view and View send exactly what DDLS/DF sends',
        _argument,
        variant,
      ),
      async () => {
        const byCode = await run(send, variant, 'DDLS/DF');
        assert.ok(byCode.requests.length > 0);
        assert.ok(
          !decodeURIComponent(byCode.requests.join('\n')).includes(
            '/sap/bc/adt/ddic/views/',
          ),
        );
        assert.deepStrictEqual(
          (await run(send, variant, 'view')).requests,
          byCode.requests,
        );
        assert.deepStrictEqual(
          (await run(send, variant, 'View')).requests,
          byCode.requests,
        );
      },
    );
  }

  // `func` and `stru` collide too; their upper case is a search name that
  // lists the code the name stands for, so the reading does not change.
  // (Where-used names a function module GROUP|MODULE, which these ZV
  // objects are not; it is left to the activation tools here.)
  for (const [_argument, variant, send] of codeCases.filter(([argument]) =>
    argument.startsWith('Activate'),
  )) {
    it(
      format(
        '%s on %s: STRU and FUNC are read as stru and func',
        _argument,
        variant,
      ),
      async () => {
        const byName = await run(send, variant, 'stru');
        const byUpper = await run(send, variant, 'STRU');
        assert.ok(byName.requests.length > 0);
        assert.deepStrictEqual(byUpper.requests, byName.requests);
        // A function module names its group; without one both are refused
        // naming the same code, and nothing is sent.
        const funcName = await run(send, variant, 'func');
        const funcUpper = await run(send, variant, 'FUNC');
        assert.deepStrictEqual(funcUpper.requests, []);
        assert.ok(
          funcUpper.answered.includes(
            'objects[].parentName is required for ZV (FUGR/FF)',
          ),
        );
        assert.deepStrictEqual(funcUpper.answered, funcName.answered);
      },
    );
  }

  for (const variant of VARIANTS) {
    it(
      format(
        'GetWhereUsed.object_type on %s: STRU sends exactly what stru sends',
        variant,
      ),
      async () => {
        const byName = await run(whereUsedOne, variant, 'stru');
        const byUpper = await run(whereUsedOne, variant, 'STRU');
        assert.ok(byName.requests.length > 0);
        assert.deepStrictEqual(byUpper.requests, byName.requests);
      },
    );
  }

  const tableCases = VARIANTS.flatMap((variant) =>
    TABLE_ARGUMENTS.map(
      ([argument, send]) => [argument, variant, send] as const,
    ),
  );

  for (const [_argument, variant, send] of tableCases) {
    it(
      format(
        '%s on %s: VIEW is the dictionary view, which it takes no code of: refused, nothing sent',
        _argument,
        variant,
      ),
      async () => {
        const { requests, answered } = await run(send, variant, 'VIEW');
        assert.deepStrictEqual(requests, []);
        assert.ok(answered.includes('"VIEW" is not one of: CLAS/OC'));
      },
    );
  }

  for (const [_argument, variant, send] of tableCases) {
    it(
      format(
        '%s on %s: view and View are the CDS view, DDLS/DF',
        _argument,
        variant,
      ),
      async () => {
        const byCode = await run(send, variant, 'DDLS/DF');
        assert.ok(byCode.requests.length > 0);
        assert.deepStrictEqual(
          (await run(send, variant, 'view')).requests,
          byCode.requests,
        );
        assert.deepStrictEqual(
          (await run(send, variant, 'View')).requests,
          byCode.requests,
        );
      },
    );
  }

  const searchCases = VARIANTS.flatMap((variant) =>
    (['SearchObject', 'HandlerSystem'] as const).map(
      (tool) => [tool, variant] as const,
    ),
  );

  for (const [tool, variant] of searchCases) {
    it(
      format(
        '%s on %s: VIEW is the search name VIEW; view and View are DDLS',
        tool,
        variant,
      ),
      async () => {
        assert.equal(await searched(tool, variant, 'VIEW'), 'VIEW');
        assert.equal(await searched(tool, variant, 'view'), 'DDLS');
        assert.equal(await searched(tool, variant, 'View'), 'DDLS');
        // A friendly name in upper case that is no word of the tables stays one.
        assert.equal(await searched(tool, variant, 'CLASS'), 'CLAS');
        assert.equal(await searched(tool, variant, 'DBVIEW'), 'VIEW');
        assert.equal(await searched(tool, variant, 'STRU'), 'STRU');
        assert.equal(await searched(tool, variant, 'FUNC'), 'FUNC');
      },
    );
  }
});
