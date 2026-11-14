/**
 * Lists every tool of lib's object-oriented groups (stdout, JSON rows) and
 * what each of the four kinds of binary serves (stderr, JSON).
 *
 * Run from the repository root, with the test paths so the compact halves
 * resolve: `tsx --tsconfig tsconfig.test.json scripts/list-tools.ts`.
 * Type-checked by `npm run test:check`.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import * as z from 'zod';
import {
  DataHandlersGroup,
  DebugHandlersGroup,
  HighLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  RuntimeRunHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../src/lib/handlers/groups/index.js';
import { noConnectionContext } from '../src/lib/handlers/index.js';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../src/lib/toolSet.js';

// Groups only read `connection` when a handler runs; listing never runs one,
// and a context built for registration refuses any use of its connection.
const ctx = noConnectionContext();

const groups = {
  // Default arguments on purpose: an empty overriding set and NoDedupStrategy,
  // so this is the full read-only surface before any set's dedup hides part of it.
  readonly: new ReadOnlyHandlersGroup(ctx),
  high: new HighLevelHandlersGroup(ctx),
  system: new SystemHandlersGroup(ctx),
  // The data tools, opt-in: listed here, served only when asked for.
  data: new DataHandlersGroup(ctx),
  runtime: new RuntimeRunHandlersGroup(ctx),
  search: new SearchHandlersGroup(ctx),
  debug: new DebugHandlersGroup(ctx),
};

type ParamInfo = { name: string; required: 'yes' | 'no' };

// Required as each schema states it: a field neither optional nor a default
// over an optional field (a default over a required one stays required).
const describeInputs = (schema: z.ZodObject<z.ZodRawShape>): ParamInfo[] =>
  Object.entries(schema.shape).map(([name, value]) => ({
    name,
    required:
      value instanceof z.ZodOptional ||
      (value instanceof z.ZodDefault && value.unwrap() instanceof z.ZodOptional)
        ? 'no'
        : 'yes',
  }));

const formatInputs = (params: ParamInfo[]): string => {
  if (params.length === 0) return '(none)';
  return params
    .map((p) => (p.required === 'yes' ? `${p.name}*` : p.name))
    .join(', ');
};

// `(everywhere)` mirrors `(none)` above: an explicit sentinel for the same
// implicit case (`available_in` omitted), not an empty string a diff would
// render as "nothing changed" when a tool actually lost the field. Sorted so
// declaring the same three environments in a different order — harmless to
// `BaseMcpServer`'s `.includes()` check — does not read as a surface change.
const formatAvailability = (
  available_in: readonly string[] | undefined,
): string =>
  available_in === undefined || available_in.length === 0
    ? '(everywhere)'
    : [...available_in].sort().join(', ');

const rows = Object.entries(groups).flatMap(([group, instance]) =>
  instance.getHandlers().map((entry) => ({
    group,
    name: entry.toolDefinition.name,
    inputs: formatInputs(describeInputs(entry.toolDefinition.inputSchema)),
    available_in: formatAvailability(entry.toolDefinition.available_in),
  })),
);

console.log(JSON.stringify(rows, null, 2));

// What each kind of binary lists (the binary fixes the tool set; there
// is no exposition). The four sets of `@mcp-abap-adt/lib/tool-set`, each tool
// with the group that registers it, in registration order. Collected and
// dumped as JSON to stderr at the end (stdout carries only the rows JSON
// above, so `list-tools.ts > /tmp/tools.json` stays parseable).
const SETS: ReadonlyArray<readonly [string, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
      modify: compactModifyEntries,
    }),
  ],
  [
    'compact-ro',
    compactReadOnlyToolSetOf({
      readOnly: compactReadOnlyEntries,
      data: compactDataEntries,
    }),
  ],
];

const visibilityBySet: Record<string, { group: string; name: string }[]> = {};
// Per transport: the leftover-session tools are stdio's only.
for (const transport of ['stdio', 'http', 'sse'] as const) {
  for (const [kind, set] of SETS) {
    // With the data tools served: what a binary lists with --enable-data-tools.
    const visible = set
      .groups(ctx, transport, { dataTools: true })
      .flatMap((group) =>
        group.getHandlers().map((entry) => ({
          group: group.getName(),
          name: entry.toolDefinition.name,
        })),
      );
    const key = transport === 'stdio' ? kind : `${kind} (${transport})`;
    console.error(key, visible.length);
    visibilityBySet[key] = visible;
  }
}

console.error('---VISIBILITY-JSON-START---');
console.error(JSON.stringify(visibilityBySet, null, 2));
console.error('---VISIBILITY-JSON-END---');
