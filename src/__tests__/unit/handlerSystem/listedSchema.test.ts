/**
 * `HandlerSystem`'s listed schema (D25, DO21): one flat object, `action`
 * required, every other property optional; each action takes exactly its
 * full tool's arguments, named and typed as there, and the takes table
 * names them. Served by every compact binary — stdio, Streamable HTTP, SSE,
 * the `-ro` ones included —, whose SDK refuses a malformed argument before
 * dispatch, in `HandlerSystem`'s name: one of the action itself, and one of
 * another action (D25-Q3, option A).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { format } from 'node:util';
import { TOOL_DEFINITION } from '../../../../compact-readonly-entries/src/handlers/handleHandlerSystem';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import {
  COMPACT_SYSTEM_TAKES,
  SYSTEM_ACTION_TOOLS,
  SYSTEM_ACTIONS,
  type SystemAction,
} from '../../../lib/compact';
import { partsOfDescription } from '../../../lib/description';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { READ_DEFINITIONS } from '../../../lib/handlers/read';
import type { ServedTransport, ToolSetKind } from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { type JsonSchema, listedJson } from '../../helpers/listedJson';
import { binaryClient } from '../../helpers/servedTools';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** A listed property as compared: its type and value rules, without its words and default. */
function typeOf(node: JsonSchema | boolean | undefined): unknown {
  if (node === undefined || typeof node === 'boolean') return node;
  const { description: _words, default: _default, ...rest } = node;
  return rest;
}

/** The listed properties of `schema`, by name. */
function propertiesOf(
  schema: JsonSchema,
): Record<string, JsonSchema | boolean> {
  return schema.properties ?? {};
}

describe('the listed schema declares each action’s arguments once', () => {
  for (const [action, variant] of VARIANTS.flatMap((variant) =>
    SYSTEM_ACTIONS.map((action) => [action, variant] as const),
  )) {
    it(
      format(
        "%s on %s: exactly its full tool's properties, typed as there",
        action,
        variant,
      ),
      () => {
        const full = READ_DEFINITIONS[SYSTEM_ACTION_TOOLS[action]];
        const fullSchema =
          'variants' in full
            ? full.variants[variant].inputSchema
            : full.inputSchema;
        const fullProperties = propertiesOf(listedJson(fullSchema));
        const listed = propertiesOf(
          listedJson(TOOL_DEFINITION.variants[variant].inputSchema),
        );
        const taken: readonly string[] = COMPACT_SYSTEM_TAKES.members[action];
        assert.deepStrictEqual(
          [...taken].sort(),
          Object.keys(fullProperties)
            .filter((name) => name !== 'background')
            .sort(),
        );
        for (const name of taken) {
          assert.deepStrictEqual(
            { name, type: typeOf(listed[name]) },
            {
              name,
              type: typeOf(fullProperties[name]),
            },
          );
        }
      },
    );
  }

  for (const variant of VARIANTS) {
    it(
      format(
        'on %s: action is the one required property, an enum of the eight; every property is taken',
        variant,
      ),
      () => {
        const listed = listedJson(
          TOOL_DEFINITION.variants[variant].inputSchema,
        );
        assert.deepStrictEqual(listed.required, ['action']);
        assert.deepStrictEqual(typeOf(propertiesOf(listed).action), {
          type: 'string',
          enum: [...SYSTEM_ACTIONS],
        });
        const taken = new Set<string>([
          ...COMPACT_SYSTEM_TAKES.every,
          ...SYSTEM_ACTIONS.flatMap(
            (action): readonly string[] => COMPACT_SYSTEM_TAKES.members[action],
          ),
        ]);
        assert.deepStrictEqual(
          Object.keys(propertiesOf(listed)).sort(),
          [...taken].sort(),
        );
      },
    );
  }

  for (const variant of VARIANTS) {
    it(
      format(
        "on %s: a shared property's words name each action that takes it",
        variant,
      ),
      () => {
        const listed = propertiesOf(
          listedJson(TOOL_DEFINITION.variants[variant].inputSchema),
        );
        for (const action of SYSTEM_ACTIONS) {
          for (const name of COMPACT_SYSTEM_TAKES.members[action]) {
            const node = listed[name];
            const words =
              node === undefined || typeof node === 'boolean'
                ? ''
                : (node.description ?? '');
            const named = [':', ',', ' '].some((after) =>
              words.includes(`${action}${after}`),
            );
            assert.deepStrictEqual(
              { name, action, named },
              {
                name,
                action,
                named: true,
              },
            );
          }
        }
      },
    );
  }
});

describe('the description', () => {
  it('starts with what it reads, marked read-only', () => {
    assert.equal(
      TOOL_DEFINITION.description.startsWith(
        '[read-only] Reads across the ABAP system: ',
      ),
      true,
    );
  });

  for (const action of SYSTEM_ACTIONS) {
    it(format("states %s by its full tool's parts", action), () => {
      const full = partsOfDescription(
        READ_DEFINITIONS[SYSTEM_ACTION_TOOLS[action]].description,
      );
      for (const variant of VARIANTS) {
        const value = partsOfDescription(
          TOOL_DEFINITION.variants[variant].description,
        )?.values?.each.find((each) => each.value === action);
        assert.ok(full !== undefined && value !== undefined, action);
        assert.equal(value.purpose, full.purpose);
        assert.deepStrictEqual(value.returns, full.returns);
      }
    });
  }
});

const BINARIES: ReadonlyArray<readonly [ServedTransport, ToolSetKind]> = [
  ['stdio', 'compact'],
  ['stdio', 'compact-ro'],
  ['http', 'compact'],
  ['http', 'compact-ro'],
  ['sse', 'compact'],
  ['sse', 'compact-ro'],
];

/** Calls refused by the listed schema: a malformed argument of the action, and of another. */
const REFUSED: ReadonlyArray<readonly [string, ToolArgs, string]> = [
  [
    'search_object maxResults "x"',
    { action: 'search_object', object_name: 'Z*', maxResults: 'x' },
    'maxResults',
  ],
  [
    'package_tree include_subpackages "yes"',
    {
      action: 'package_tree',
      package_name: 'ZPKG_A',
      include_subpackages: 'yes',
    },
    'include_subpackages',
  ],
  [
    'atc_results age_min "1"',
    { action: 'atc_results', created_by: '*', age_min: '1' },
    'age_min',
  ],
  [
    'search_source query ""',
    { action: 'search_source', query: '', packages: ['ZPKG_A'] },
    'query',
  ],
  [
    'search_object worklist_id 123',
    { action: 'search_object', object_name: 'Z*', worklist_id: 123 },
    'worklist_id',
  ],
  [
    'atc_result packages "Z*"',
    { action: 'atc_result', display_id: 'RESULT_A', packages: 'Z*' },
    'packages',
  ],
  [
    'where_used display_id 1',
    {
      action: 'where_used',
      object_name: 'ZCL_A',
      object_type: 'class',
      display_id: 1,
    },
    'display_id',
  ],
];

describe('every compact binary serves HandlerSystem, refuses a malformed argument before dispatch, and serves neither HandlerSearch nor HandlerWhereUsed', () => {
  let standIn: AdtStandIn;
  const saved = process.env.SAP_SYSTEM_TYPE;

  before(async () => {
    standIn = await adtStandIn();
  });

  after(async () => {
    await standIn.close();
    if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = saved;
    resetProcessLatchForTests();
  });

  for (const [kind, transport, variant] of VARIANTS.flatMap((variant) =>
    BINARIES.map(([transport, kind]) => [kind, transport, variant] as const),
  )) {
    it(format('%s over %s on %s', kind, transport, variant), async () => {
      process.env.SAP_SYSTEM_TYPE = variant;
      resetProcessLatchForTests();
      const before = standIn.requests.length;
      const { client, close } = await binaryClient(transport, kind, standIn);
      try {
        const listed = (await client.listTools()).tools.map((t) => t.name);
        assert.ok(listed.includes('HandlerSystem'));
        // HandlerSearch and HandlerWhereUsed are in no compact set, and a call
        // to either answers as any unknown tool name does.
        assert.ok(!listed.includes('HandlerSearch'));
        assert.ok(!listed.includes('HandlerWhereUsed'));
        const unknownAnswer = async (name: string) =>
          JSON.stringify(
            await client.callTool({ name, arguments: { query: 'Z*' } }),
          )
            .split(name)
            .join('<tool>');
        const madeUp = await unknownAnswer('HandlerMadeUpTool');
        assert.ok(madeUp.includes('<tool>'));
        assert.equal(await unknownAnswer('HandlerSearch'), madeUp);
        assert.equal(await unknownAnswer('HandlerWhereUsed'), madeUp);
        for (const [name, args, argument] of REFUSED) {
          const answer = await client.callTool({
            name: 'HandlerSystem',
            arguments: args,
          });
          const content = Array.isArray(answer.content) ? answer.content : [];
          const first = content[0];
          const text =
            typeof first === 'object' &&
            first !== null &&
            'text' in first &&
            typeof first.text === 'string'
              ? first.text
              : '';
          assert.deepStrictEqual(
            { name, isError: answer.isError },
            { name, isError: true },
          );
          assert.ok(
            text.includes(
              'Input validation error: Invalid arguments for tool HandlerSystem',
            ),
            name,
          );
          assert.ok(text.includes(argument));
        }
        // Nothing reached the stand-in for a refused call.
        assert.deepStrictEqual(
          standIn.requests
            .slice(before)
            .filter((r) => !r.url.includes('/discovery')),
          [],
        );
      } finally {
        await close();
      }
    });
  }
});
