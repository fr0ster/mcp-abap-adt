import type { HandlerContext } from '../src/handlers/interfaces.js';
import {
  CompactHandlersGroup,
  HighLevelHandlersGroup,
  LowLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  ReadVsGetDedupStrategy,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../src/lib/handlers/groups/index.js';

// Groups only read `connection` when a handler runs; listing never runs one.
const ctx = {
  connection: null,
  logger: undefined,
} as unknown as HandlerContext;

const groups = {
  // Default arguments on purpose: an empty overriding set and NoDedupStrategy,
  // so this is the full read-only surface before any exposition hides part of it.
  readonly: new ReadOnlyHandlersGroup(ctx),
  high: new HighLevelHandlersGroup(ctx),
  low: new LowLevelHandlersGroup(ctx),
  compact: new CompactHandlersGroup(ctx),
  system: new SystemHandlersGroup(ctx),
  search: new SearchHandlersGroup(ctx),
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

type GroupKey = keyof typeof groups;

// Annotated rather than inferred: without this the array widens to string[][] and
// groups[e] indexes an object with no index signature, which strict mode rejects.
const EXPOSITIONS: ReadonlyArray<readonly GroupKey[]> = [
  ['readonly'],
  ['high'],
  ['low'],
  ['readonly', 'high'], // the default
  ['readonly', 'low'],
  ['compact'],
];

// Mirrors launcher.ts:203-241: overriding groups first, then a read-only group that has
// seen their names, system only alongside readonly, search always.
// Collected across all six modes and dumped as JSON to stderr at the end (stdout carries
// only the rows JSON above, so `list-tools.ts > /tmp/tools.json` stays parseable).
const visibilityByExposition: Record<
  string,
  { group: GroupKey; name: string }[]
> = {};

for (const exposition of EXPOSITIONS) {
  const overriding = exposition.filter((e) => e !== 'readonly');
  const overridingNames = new Set<string>(
    overriding.flatMap((e) =>
      groups[e].getHandlers().map((h) => h.toolDefinition.name),
    ),
  );

  const visible: { group: GroupKey; name: string }[] = [];
  const take = (
    group: GroupKey,
    entries: { toolDefinition: { name: string } }[],
  ) => {
    for (const e of entries)
      visible.push({ group, name: e.toolDefinition.name });
  };

  if (exposition.includes('readonly')) {
    take(
      'readonly',
      new ReadOnlyHandlersGroup(
        ctx,
        overridingNames,
        new ReadVsGetDedupStrategy(),
      ).getHandlers(),
    );
    take('system', groups.system.getHandlers());
  }
  for (const e of overriding) take(e, groups[e].getHandlers());
  take('search', groups.search.getHandlers());

  console.error(exposition.join(','), visible.length);
  visibilityByExposition[exposition.join(',')] = visible;
  // Write `visible` out per mode: the "visible in" column is built from these six sets.
}

console.error('---VISIBILITY-JSON-START---');
console.error(JSON.stringify(visibilityByExposition, null, 2));
console.error('---VISIBILITY-JSON-END---');
