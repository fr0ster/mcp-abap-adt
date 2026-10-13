/**
 * Lists every tool of lib's object-oriented groups (stdout, JSON rows) and
 * what each of the four kinds of binary serves (stderr, JSON).
 *
 * Run from the repository root, with the test paths so the compact halves
 * resolve: `tsx --tsconfig tsconfig.test.json scripts/list-tools.ts`.
 * Type-checked by `npm run test:check`.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { HandlerContext } from '../src/handlers/interfaces.js';
import {
  DebugHandlersGroup,
  HighLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  ReadVsGetDedupStrategy,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../src/lib/handlers/groups/index.js';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../src/lib/toolSet.js';

// Groups only read `connection` when a handler runs; listing never runs one.
const ctx = {
  connection: null,
  logger: undefined,
} as unknown as HandlerContext;

const groups = {
  // Default arguments on purpose: an empty overriding set and NoDedupStrategy,
  // so this is the full read-only surface before any set's dedup hides part of it.
  readonly: new ReadOnlyHandlersGroup(ctx),
  high: new HighLevelHandlersGroup(ctx),
  system: new SystemHandlersGroup(ctx),
  search: new SearchHandlersGroup(ctx),
  debug: new DebugHandlersGroup(ctx),
};

// Two input-schema shapes exist among the 362 tools (a codebase finding, not a script
// bug — see the document): most `inputSchema`s are plain JSON Schema
// (`{ type: 'object', properties: {...}, required: [...] }`), but five handlers
// (CreatePackage, GetPackageContents, GetTableContents, GetInclude, SearchSource) declare
// a bare zod raw shape instead — a plain object whose values are zod schema instances,
// with no `type`/`properties`/`required` wrapper at all. Reading `.properties`/`.required`
// on that shape silently returns `undefined`, which previously rendered as "(none)" — the
// exact "empty cell reads as checked" failure the brief warns about, one level below the
// column. Detect the shape instead of hardcoding the five names, so a sixth handler
// written in either style lands correctly with no script edit.
type ParamInfo = { name: string; required: 'yes' | 'no' | 'unknown' };

const isJsonSchemaObject = (
  v: unknown,
): v is {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
} =>
  !!v &&
  typeof v === 'object' &&
  (v as { type?: unknown }).type === 'object' &&
  typeof (v as { properties?: unknown }).properties === 'object' &&
  (v as { properties?: unknown }).properties !== null;

const hasIsOptional = (v: unknown): v is { isOptional: () => boolean } =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as { isOptional?: unknown }).isOptional === 'function';

const describeInputs = (schema: unknown): ParamInfo[] => {
  if (isJsonSchemaObject(schema)) {
    const required = new Set(schema.required ?? []);
    return Object.keys(schema.properties).map((name) => ({
      name,
      required: required.has(name) ? 'yes' : 'no',
    }));
  }
  if (schema && typeof schema === 'object') {
    // Not JSON Schema: a bare zod raw shape. Its own keys are the parameter names;
    // whether each is required is read from the zod type itself via `isOptional()`
    // rather than guessed. If a value doesn't expose that (not a zod type at all),
    // the row says so explicitly instead of defaulting to yes or no.
    return Object.entries(schema as Record<string, unknown>).map(
      ([name, value]) => ({
        name,
        required: hasIsOptional(value)
          ? value.isOptional()
            ? 'no'
            : 'yes'
          : 'unknown',
      }),
    );
  }
  return [];
};

const formatInputs = (params: ParamInfo[]): string => {
  if (params.length === 0) return '(none)';
  return params
    .map((p) => {
      if (p.required === 'yes') return `${p.name}*`;
      if (p.required === 'unknown') return `${p.name} (required: unknown)`;
      return p.name;
    })
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

// What each kind of binary lists (C23: the binary fixes the tool set; there
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
      modify: compactModifyEntries,
    }),
  ],
  ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries)],
];

const visibilityBySet: Record<string, { group: string; name: string }[]> =
  {};
for (const [kind, set] of SETS) {
  const visible = set.groups(ctx).flatMap((group) =>
    group.getHandlers().map((entry) => ({
      group: group.getName(),
      name: entry.toolDefinition.name,
    })),
  );
  console.error(kind, visible.length);
  visibilityBySet[kind] = visible;
}

console.error('---VISIBILITY-JSON-START---');
console.error(JSON.stringify(visibilityBySet, null, 2));
console.error('---VISIBILITY-JSON-END---');
