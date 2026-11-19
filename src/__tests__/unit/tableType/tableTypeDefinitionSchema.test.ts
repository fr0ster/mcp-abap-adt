/**
 * The table type's definition properties through the MCP SDK.
 *
 * SAP answers SUCCESS to an unlisted `row_type_kind`, `access_type`,
 * `key_definition` or `key_kind` and stores something else (measured on
 * premise, 2026-11-01), so the schema's `enum` is the only guard: an unlisted
 * value is refused by the SDK before the handler, hence before any request.
 * A property not given reaches the handler absent: no schema `default`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type * as z from 'zod';
import { TOOL_DEFINITION as CreateTableType } from '../../../handlers/table_type/high/handleCreateTableType';
import { TOOL_DEFINITION as UpdateTableType } from '../../../handlers/table_type/high/handleUpdateTableType';
import { assertNoProperty } from '../../helpers/assertions';
import { jsonAt, listedJson } from '../../helpers/listedJson';

const TOOLS = [
  {
    tool: CreateTableType,
    args: { table_type_name: 'ZTT', package_name: '$TMP' },
  },
  { tool: UpdateTableType, args: { table_type_name: 'ZTT' } },
];

const MEASURED = {
  row_type_kind: [
    'predefinedAbapType',
    'dictionaryType',
    'refToPredefinedAbapType',
    'refToDictionaryType',
    'refToClassOrInterfaceType',
    'rangeTypeOnPredefinedType',
    'rangeTypeOnDataelement',
  ],
  access_type: ['standard', 'sorted', 'hashed', 'index', 'notSpecified'],
  key_definition: ['standard', 'rowType', 'empty', 'notSpecified'],
  key_kind: ['unique', 'nonUnique', 'notSpecified'],
};

const CASES = TOOLS.flatMap(({ tool, args }) =>
  Object.entries(MEASURED).flatMap(([property, values]) =>
    values.map((value) => ({ tool, args, property, value })),
  ),
);

/** What the handler receives for a client call, and whether the SDK refused it. */
async function call(
  tool: { name: string; inputSchema: z.ZodObject },
  args: Record<string, unknown>,
): Promise<{ seen: Record<string, unknown> | undefined; refused: boolean }> {
  let seen: Record<string, unknown> | undefined;
  const server = new McpServer({ name: 'probe', version: '1.0.0' });
  server.registerTool(
    tool.name,
    { inputSchema: tool.inputSchema },
    async (given: Record<string, unknown>): Promise<CallToolResult> => {
      seen = given;
      return { content: [{ type: 'text', text: 'ok' }] };
    },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const result = await client.callTool({ name: tool.name, arguments: args });
  await client.close();
  return { seen, refused: result.isError === true };
}

for (const { tool, args, property, value } of CASES) {
  describe(`${tool.name} ${property}`, () => {
    it(`takes ${value}`, async () => {
      const { seen, refused } = await call(tool, {
        ...args,
        [property]: value,
      });
      assert.equal(refused, false);
      // The properties are flat names: Jest's path walk is one step.
      assert.ok(property in Object(seen));
      assert.deepStrictEqual(Reflect.get(Object(seen), property), value);
    });
  });
}

for (const { tool, args } of TOOLS) {
  describe(`${tool.name}`, () => {
    for (const property of Object.keys(MEASURED)) {
      it(
        format('refuses an unlisted %s before the handler', property),
        async () => {
          const { seen, refused } = await call(tool, {
            ...args,
            [property]: 'unlistedValue',
          });
          assert.equal(refused, true);
          assert.equal(seen, undefined);
        },
      );
    }

    it('fills no definition property that was not given', async () => {
      const { seen, refused } = await call(tool, args);
      assert.equal(refused, false);
      for (const property of [
        ...Object.keys(MEASURED),
        'row_type_name',
        'data_type',
        'length',
        'decimals',
      ]) {
        assertNoProperty(seen, property);
      }
    });

    it('declares no default for a definition property', () => {
      const properties = listedJson(tool.inputSchema).properties ?? {};
      assertNoProperty(properties.row_type_kind, 'default');
      assertNoProperty(properties.row_type_name, 'default');
      assertNoProperty(properties.data_type, 'default');
      assertNoProperty(properties.length, 'default');
      assertNoProperty(properties.decimals, 'default');
      assertNoProperty(properties.access_type, 'default');
      assertNoProperty(properties.key_definition, 'default');
      assertNoProperty(properties.key_kind, 'default');
    });

    it('lists exactly the measured values', () => {
      const schema = listedJson(tool.inputSchema);
      const values = (name: string) => [...(jsonAt(schema, name).enum ?? [])];
      assert.deepStrictEqual(
        values('row_type_kind').sort(),
        [...MEASURED.row_type_kind].sort(),
      );
      assert.deepStrictEqual(
        values('access_type').sort(),
        [...MEASURED.access_type].sort(),
      );
      assert.deepStrictEqual(
        values('key_definition').sort(),
        [...MEASURED.key_definition].sort(),
      );
      assert.deepStrictEqual(
        values('key_kind').sort(),
        [...MEASURED.key_kind].sort(),
      );
    });
  });
}
