/**
 * The table type's definition properties through the MCP SDK.
 *
 * SAP answers SUCCESS to an unlisted `row_type_kind`, `access_type`,
 * `key_definition` or `key_kind` and stores something else (measured on
 * premise, 2026-11-01), so the schema's `enum` is the only guard: an unlisted
 * value is refused by the SDK before the handler, hence before any request.
 * A property not given reaches the handler absent: no schema `default`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type * as z from 'zod';
import { TOOL_DEFINITION as CreateTableType } from '../../../handlers/table_type/high/handleCreateTableType';
import { TOOL_DEFINITION as UpdateTableType } from '../../../handlers/table_type/high/handleUpdateTableType';
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

describe.each(CASES)(
  '$tool.name $property',
  ({ tool, args, property, value }) => {
    it(`takes ${value}`, async () => {
      const { seen, refused } = await call(tool, {
        ...args,
        [property]: value,
      });
      expect(refused).toBe(false);
      expect(seen).toHaveProperty(property, value);
    });
  },
);

describe.each(TOOLS)('$tool.name', ({ tool, args }) => {
  it.each(Object.keys(MEASURED))(
    'refuses an unlisted %s before the handler',
    async (property) => {
      const { seen, refused } = await call(tool, {
        ...args,
        [property]: 'unlistedValue',
      });
      expect(refused).toBe(true);
      expect(seen).toBeUndefined();
    },
  );

  it('fills no definition property that was not given', async () => {
    const { seen, refused } = await call(tool, args);
    expect(refused).toBe(false);
    for (const property of [
      ...Object.keys(MEASURED),
      'row_type_name',
      'data_type',
      'length',
      'decimals',
    ]) {
      expect(seen).not.toHaveProperty(property);
    }
  });

  it('declares no default for a definition property', () => {
    const properties = listedJson(tool.inputSchema).properties ?? {};
    expect(properties.row_type_kind).not.toHaveProperty('default');
    expect(properties.row_type_name).not.toHaveProperty('default');
    expect(properties.data_type).not.toHaveProperty('default');
    expect(properties.length).not.toHaveProperty('default');
    expect(properties.decimals).not.toHaveProperty('default');
    expect(properties.access_type).not.toHaveProperty('default');
    expect(properties.key_definition).not.toHaveProperty('default');
    expect(properties.key_kind).not.toHaveProperty('default');
  });

  it('lists exactly the measured values', () => {
    const schema = listedJson(tool.inputSchema);
    const values = (name: string) => [...(jsonAt(schema, name).enum ?? [])];
    expect(values('row_type_kind').sort()).toEqual(
      [...MEASURED.row_type_kind].sort(),
    );
    expect(values('access_type').sort()).toEqual(
      [...MEASURED.access_type].sort(),
    );
    expect(values('key_definition').sort()).toEqual(
      [...MEASURED.key_definition].sort(),
    );
    expect(values('key_kind').sort()).toEqual([...MEASURED.key_kind].sort());
  });
});
