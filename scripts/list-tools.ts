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

const rows = Object.entries(groups).flatMap(([group, instance]) =>
  instance.getHandlers().map((entry) => ({
    group,
    name: entry.toolDefinition.name,
    schema: entry.toolDefinition.inputSchema,
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
